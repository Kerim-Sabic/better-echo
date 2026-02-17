# AI Pipelines and Orchestration

Last Updated: 2026-02-16  
Owner: AI/Backend

## Scope

How inference and orchestration stages are triggered, persisted, and exposed to StudyResults.

## Pipeline Stages

1. Upload and index DICOM data.
2. Run PanEcho inference.
3. Run EchoPrime inference.
4. Run EchoNet Dynamic segmentation.
5. Run Measurements 2D inference.
6. Build PanEcho+EchoPrime combined artifact.
7. Build Dynamic+Measurements combined artifact.
8. Generate LLM report artifact (optional by config).

## Trigger Model

Frontend drives orchestration via polling endpoints:

1. `/api/studies/{study_uid}/PanEcho-EchoPrime-combined-results`
2. `/api/studies/{study_uid}/Dynamic-Measurements-combined-results`
3. `/api/studies/{study_uid}/llm-report-results`

Backend behavior:

1. Creates pending marker rows to enforce idempotency.
2. Enqueues background tasks only when marker creation succeeds.
3. Returns `202 pending` until completion.

Implementation references:

1. PanEcho+EchoPrime route: [`combined_panecho_echoprime_api.py`](../../backend/app/api/orchestration_apis/combined_panecho_echoprime_api.py#L29)
2. Dynamic+Measurements route: [`combined_dynamic_measurements_api.py`](../../backend/app/api/orchestration_apis/combined_dynamic_measurements_api.py#L28)
3. LLM report results route: [`llm_report_get_api.py`](../../backend/app/api/orchestration_apis/llm_report_get_api.py#L35)

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
1. usually represented as pending-for-retry path until remediation.

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
2. Range-status derivation: [`measurement_ranges.py`](../../backend/app/helpers/measurement_ranges.py#L153)

## Deterministic LLM Report Controls

LLM report generation uses deterministic configuration knobs:

1. `LLM_TEMPERATURE_REPORT`
2. `LLM_TOP_P_REPORT`
3. `LLM_SEED_REPORT`

Configuration and usage references:

1. Config defaults: [`config.py`](../../backend/app/core/config.py#L45)
2. Runtime call wiring: [`llm_report_service.py`](../../backend/app/services/llm_report_service.py#L56)

## Performance Controls

Env-driven controls in backend config:

1. Per-model preload toggles.
2. Warmup toggles.
3. Batch sizes.
4. Device selection (`auto`, `cpu`, `cuda:<index>`).

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
