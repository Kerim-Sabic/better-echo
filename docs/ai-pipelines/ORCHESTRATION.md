# AI Pipelines and Orchestration

Last Updated: 2026-03-06  
Owner: AI/Backend

## Scope

How inference and orchestration stages are triggered, persisted, and exposed to StudyResults.

## Pipeline Stages

1. Upload and index DICOM data.
2. Queue prefilter and routing map (hard compatibility checks + confidence gate + Doppler short-circuit).
3. EchoPrime view classification pass.
4. EchoPrime metrics pass (gated set).
5. PanEcho metrics pass (gated set).
6. Build PanEcho+EchoPrime combined artifact.
7. Build Dynamic+Measurements combined artifact (EchoNet + 2D + Doppler lanes).
8. Generate LLM report artifact (optional by config).

## Trigger Model

Backend queue owns orchestration progression:

1. `POST /api/studies/{study_uid}/pipeline/start` enqueues/reuses a study-owned job.
2. In-process scheduler advances queue stages server-side.
3. `GET /api/studies/{study_uid}/pipeline/status` is observer-only status/telemetry.

Legacy orchestration result endpoints remain for result retrieval, but are now observer-only:

1. `/api/studies/{study_uid}/PanEcho-EchoPrime-combined-results`
2. `/api/studies/{study_uid}/Dynamic-Measurements-combined-results`
3. `/api/studies/{study_uid}/llm-report-results`

They do not enqueue or progress pipeline stages.

Queue foundation (implemented):

1. `POST /api/studies/{study_uid}/pipeline/start` creates/reuses one study-owned queue job.
2. `GET /api/studies/{study_uid}/pipeline/status` returns observer-only job + stage state.
3. In-process scheduler loop progresses queue jobs server-side.
4. Queue jobs write to draft artifact sets and expose stage payload snapshots for observers.
5. Draft/active artifact boundary now exists:
1. queue start creates `draft` artifact set for the job
2. existing study-level artifacts are assigned to `active` set baseline
3. status payload exposes both sets for frontend-safe transition planning

Promote/cancel additions:

1. `POST /api/studies/{study_uid}/pipeline/promote` promotes latest completed draft set to active atomically.
2. `POST /api/studies/{study_uid}/pipeline/cancel` supports:
1. immediate cancel for queued/completed preview jobs
2. cooperative cancel request for running jobs (`cancel_requested_at` checkpoint)
3. cleanup scopes (`none`, `append_delta`, `new_study`) applied by backend cleanup service.

Stage/routing additions:

1. Queue worker now executes real stage handlers:
1. `prefilter`
2. `combined`
3. `dynamic_measurements`
4. optional `llm`
2. Prefilter routing now enforces:
1. hard compatibility checks
2. spectral Doppler short-circuit
3. global confidence gate via `PIPELINE_VIEW_CONFIDENCE_MIN` (default `0.75`)
3. Combined and dynamic stages now persist draft-scoped artifacts directly through queue execution.

Regenerate additions:

1. `POST /api/studies/{study_uid}/pipeline/regenerate-combined` is implemented.
2. Regenerate requires an active combined baseline (`409` when missing).
3. Successful regenerate auto-promotes the job draft artifact set to active.
4. Failed regenerate keeps previous active artifact set unchanged.
5. Combined regenerate preserves clinician override map while refreshing AI raw values.

Remaining redesign work:

1. Post-pilot throughput optimization (controlled parallel queue workers for high-VRAM profile).
2. Viewer-focused frontend integration on refactored frontend branch.
3. Detailed backend plan: [`BACKEND_QUEUE_REWORK_PLAN.md`](./BACKEND_QUEUE_REWORK_PLAN.md).
4. Detailed frontend plan: [`FRONTEND_QUEUE_INTEGRATION_PLAN.md`](./FRONTEND_QUEUE_INTEGRATION_PLAN.md).

Implementation references:

1. PanEcho+EchoPrime route: [`combined_panecho_echoprime_api.py`](../../backend/app/api/results/combined_panecho_echoprime_api.py)
2. Dynamic+Measurements route: [`combined_dynamic_measurements_api.py`](../../backend/app/api/results/combined_dynamic_measurements_api.py)
3. LLM report results route: [`llm_report_get_api.py`](../../backend/app/api/results/llm_report_get_api.py)
4. Queue start route: [`pipeline_start_api.py`](../../backend/app/api/pipeline/pipeline_start_api.py)
5. Queue status route: [`pipeline_status_api.py`](../../backend/app/api/pipeline/pipeline_status_api.py)
6. Queue service (canonical): [`service.py`](../../backend/app/services/pipeline/service.py#L1)
7. Queue scheduler (canonical): [`scheduler.py`](../../backend/app/services/pipeline/scheduler.py#L1)
8. Queue promote route: [`pipeline_promote_api.py`](../../backend/app/api/pipeline/pipeline_promote_api.py)
9. Queue cancel route: [`pipeline_cancel_api.py`](../../backend/app/api/pipeline/pipeline_cancel_api.py)
10. Queue cleanup service (canonical): [`cleanup.py`](../../backend/app/services/pipeline/cleanup.py#L1)
11. Queue stage registry/handlers (canonical): [`registry.py`](../../backend/app/services/pipeline/internal/registry.py#L1), [`stages/`](../../backend/app/services/pipeline/stages/)
12. Prefilter routing helper: [`pipeline_routing.py`](../../backend/app/helpers/pipeline/pipeline_routing.py#L64)
13. Queue regenerate route: [`pipeline_regenerate_api.py`](../../backend/app/api/pipeline/pipeline_regenerate_api.py)

Service path note:

1. Canonical runtime imports target modules under `backend/app/services/pipeline/`.
2. Legacy top-level service shims were removed in Iteration 7.

## Persistence Contract

All pipeline artifacts are persisted in `DerivedResult` rows with:

1. `type`
2. `status`
3. `value_json`
4. `study_id`
5. optional `instance_id`

Model reference:

1. [`derived_results.py`](../../backend/app/database_models/derived_results.py#L12)

Frontend consumes normalized payloads from orchestration endpoints rather than reading raw DB structures.

## Orchestration State Semantics

1. `pending`:
1. HTTP `202` + retry semantics.
2. `complete`:
1. HTTP `200` + result payload.
3. `failed`:
1. HTTP `200` + failed payload with `detail` when failure is known.

## LLM Report Stage

LLM generation prerequisites:

1. PanEcho+EchoPrime combined row must be complete.
2. Dynamic+Measurements combined row must be complete.

On completion:

1. LLM report row is written to `DerivedResult`.
2. Study status may be finalized to `completed`.

Implementation references:

1. LLM generation endpoint: [`llm_report_generate_api.py`](../../backend/app/api/llm/llm_report_generate_api.py#L22)
2. Background job: [`generate_llm_report.py`](../../backend/app/background_tasks/generate_llm_report.py#L30)

## LLM Context Enrichment Contract

Context payload for report generation is built from combined results and includes:

1. `patient.sex` (normalized from study patient metadata).
2. Task-level `range_status` for measurement tasks (`normal`, `borderline`, `abnormal`, or null).
3. Override-aware task values/labels and discrepancy metadata.

Implementation references:

1. Context builder: [`build_combined_sections_for_llm`](../../backend/app/helpers/row_to_dict/combined_results_row_to_dict.py#L67)
2. Range-status derivation: [`measurement_ranges.py`](../../backend/app/helpers/clinical/measurement_ranges.py#L153)

## Deterministic LLM Report Controls

LLM report generation uses deterministic configuration knobs:

1. `LLM_TEMPERATURE_REPORT`
2. `LLM_TOP_P_REPORT`
3. `LLM_SEED_REPORT`

Configuration and usage references:

1. Config defaults: [`config.py`](../../backend/app/core/config.py#L45)
2. Runtime call wiring: [`llm_report_service.py`](../../backend/app/services/reporting/llm_report_service.py)

## Performance Controls

Env-driven controls in backend config:

1. Per-model preload toggles.
2. Warmup toggles.
3. Batch sizes.
4. Device selection (`auto`, `cpu`, `cuda:<index>`).
5. Queue routing confidence gate (`PIPELINE_VIEW_CONFIDENCE_MIN`).

Operational note:

1. Tune these values per hardware profile and VRAM limits.

Config reference:

1. [`config.py`](../../backend/app/core/config.py#L18)

## Failure Modes

1. Orthanc unavailable:
1. upload/inference pipeline breaks.
2. low VRAM:
1. preloads skipped and latency increases.
3. schema drift:
1. orchestration endpoints may fail at query/serialization boundaries.
4. LLM service unavailable:
1. core measurements can still complete while LLM report remains pending/unavailable.

## Frontend Integration Points

StudyResults query hooks:

1. [`usePanechoEchoprimeResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/usePanechoEchoprimeResultsQuery.js#L9)
2. [`useDynamicMeasurementsResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/useDynamicMeasurementsResultsQuery.js#L9)
3. [`useLlmReportResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/useLlmReportResultsQuery.js#L9)

Aggregator hook:

1. [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js#L8)

