# Backend Queue Redesign Plan (Server-Owned Orchestration)

Last Updated: 2026-02-24  
Owner: Backend/AI

## Scope

This is a backend-first implementation plan.  
Frontend wiring is defined as follow-up and intentionally deferred until the OHIF branch stabilizes.

Goals:

1. Start AI processing from Upload & Parse flow, without requiring StudyResults polling to advance stages.
2. Guarantee strict per-study ownership and stage sequencing for single-user and multi-user concurrency.
3. Keep partial results available as soon as each stage completes.
4. Preserve active clinician-facing data until the user explicitly promotes new results.
5. Support clean cancel semantics for both new studies and append-to-existing-study flows.
6. Preserve clinician overrides when PanEcho/EchoPrime is regenerated.
7. Improve throughput while keeping architecture minimal and maintainable.

## Current Behavior (Code Reality)

Current orchestration is still endpoint-triggered by frontend polling:

1. Combined stage is triggered by [`combined_panecho_echoprime_api.py`](../../backend/app/api/orchestration_apis/combined_panecho_echoprime_api.py).
2. Dynamic+Measurements stage is triggered by [`combined_dynamic_measurements_api.py`](../../backend/app/api/orchestration_apis/combined_dynamic_measurements_api.py).
3. LLM stage is triggered by [`llm_report_get_api.py`](../../backend/app/api/orchestration_apis/llm_report_get_api.py).
4. StudyResults polling in [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js) currently causes stage progression as a side effect.
5. Upload endpoint stores DICOM/study data but does not enqueue autonomous pipeline work:
   1. [`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py)
6. NewStudy cancel is navigation-only today and does not perform backend cleanup.

Main limitation:

1. Progress can depend on page activity.
2. There is no draft/active result boundary during upload-phase processing.
3. Regeneration semantics are not isolated from existing active artifacts.

## Why Change Is Required

In plain terms:

1. Backend must own progression regardless of tab focus, app focus, or route.
2. New uploads should feel faster by beginning pipeline work before StudyResults.
3. Cancel must be real cancel: queue + persisted artifacts + Orthanc cleanup for newly uploaded content.
4. Existing active results must not disappear simply because a preview run finished.
5. Regenerate must update AI raw values while preserving doctor-entered overrides.

## Target Architecture (Plain English)

1. Upload batch completes.
2. Frontend calls one start endpoint.
3. Backend creates or reuses one pipeline job bound to that study/user.
4. Worker runs stages in order and writes output into a draft result set.
5. User clicks Continue to StudyResults.
6. Backend promotes draft result set to active atomically.
7. Cancel discards draft set and queue job; append-mode cancel deletes only newly uploaded assets.
8. UI polls status/events as observer-only; polling does not advance stages.

## Locked Runtime Rules

### A) Filtering and Routing

1. Hard DICOM compatibility filter runs first.
2. Spectral Doppler tag detection short-circuits routing to Doppler lane.
3. Global view confidence gate is `>= 0.75`.
4. Skip reasons are persisted:
   1. `INCOMPATIBLE_DICOM`
   2. `SPECTRAL_DOPPLER_TAG_ROUTED`
   3. `LOW_VIEW_CONFIDENCE`
   4. `NO_TASK_MATCH`

### B) Stage Order

1. Prefilter + routing map.
2. EchoPrime view classification.
3. EchoPrime metrics on gated compatible set.
4. PanEcho metrics on gated compatible set.
5. Combined result generation and persistence.
6. Dynamics on compatible instances.
7. Measurements by weight across compatible instances (2D lane and Doppler lane).
8. Optional LLM stage.

### C) Completion and Failure

1. LLM enabled: `completed` only after LLM stage completes.
2. LLM disabled: `completed` after combined + dynamic/measurements complete.
3. Any required stage failure sets study status `failed`.

## Draft vs Active Artifact Model (Critical)

### Why

Without a draft layer, upload-phase processing can overwrite active results before user confirmation.

### Rules

1. All upload-phase jobs write to `draft` artifact set.
2. `Continue to StudyResults` promotes latest successful draft set to `active`.
3. Promotion is atomic:
   1. Old active remains visible until swap.
   2. New active becomes visible in one transaction.
4. `Cancel` during NewStudy discards draft set and cancels active queue job.
5. Existing active artifacts are never deleted by cancel in append mode.
6. `regenerate_combined` runs in draft first and auto-promotes only on success.
7. If regenerate fails, current active artifacts remain unchanged.

### Cancel Semantics

1. New study (created in current upload flow):
   1. Cancel removes queue jobs, draft artifacts, DB study rows, and Orthanc study payload.
2. Existing study append flow:
   1. Cancel removes only newly uploaded instances + draft artifacts + queue job.
   2. Existing active artifacts and existing overrides remain untouched.

## Override Preservation Rules (Regenerate-Safe)

1. PanEcho/EchoPrime regenerate updates AI raw values only.
2. Existing `overrides` map is preserved and re-applied by key during combined persistence.
3. Combined persistence must never wipe override keys just because new AI payload arrived.
4. If a key no longer exists in raw payload, keep override key in persisted override object and mark as non-rendered in UI if needed.

## Queue and Persistence Design

### New Table: `pipeline_jobs`

Purpose: one row per active/finished orchestration run for a study.

Fields:

1. `id`
2. `study_id`
3. `user_id`
4. `status` (`queued`, `running`, `completed`, `failed`, `cancelled`)
5. `current_stage`
6. `run_mode` (`upload_preview`, `append_preview`, `regenerate_combined`)
7. `input_revision`
8. `cleanup_scope` (`new_study`, `append_delta`, `none`)
9. `uploaded_instance_uids_json` (delta list for append/new-study cleanup)
10. `last_error`
11. `queued_at`, `started_at`, `finished_at`, `updated_at`

Constraints:

1. One active job per study at a time.
2. Index `(status, queued_at)`.
3. Index `(study_id, created_at desc)`.

### New Table: `pipeline_stage_runs`

Purpose: per-stage observability and debugging.

Fields:

1. `id`
2. `pipeline_job_id`
3. `study_id`
4. `stage_name`
5. `status`
6. `payload_json` (counts, timings, skip reasons)
7. `error`
8. `started_at`, `finished_at`

### New Table: `pipeline_artifact_sets`

Purpose: explicit draft/active boundary.

Fields:

1. `id`
2. `study_id`
3. `pipeline_job_id`
4. `state` (`draft`, `active`, `discarded`)
5. `input_revision`
6. `created_at`, `promoted_at`, `discarded_at`

### Existing Table Hardening: `derived_results`

Planned changes:

1. Add `artifact_set_id` linkage for rows generated by queue worker.
2. Keep per-instance outputs many-to-one as needed.
3. Use upsert patterns on study-level artifacts to avoid duplicate active rows under races.

## API Contract Changes (Backend)

### New: Start Pipeline

1. `POST /api/studies/{study_uid}/pipeline/start`
2. Auth + ownership required.
3. Idempotent:
   1. Return existing active job if already running.
   2. Else enqueue new job.
4. Request includes `run_mode` (`upload_preview`, `append_preview`, `regenerate_combined`).
5. Request includes cleanup context for cancel semantics:
   1. `cleanup_scope`
   2. `uploaded_instance_uids` (batch delta set)

### New: Pipeline Status

1. `GET /api/studies/{study_uid}/pipeline/status`
2. Auth + ownership required.
3. Returns:
   1. job status
   2. stage statuses
   3. artifact set state (`draft` vs `active`)
   4. top-level error if failed

### New: Promote Draft to Active

1. `POST /api/studies/{study_uid}/pipeline/promote`
2. Auth + ownership required.
3. Promotes latest successful draft artifact set.
4. Fails safely if no successful draft exists.

### New: Cancel Pipeline

1. `POST /api/studies/{study_uid}/pipeline/cancel`
2. Auth + ownership required.
3. Cancels queued/running job.
4. Applies cleanup semantics:
   1. new-study flow cleanup
   2. append-only cleanup

### New: Regenerate Combined

1. `POST /api/studies/{study_uid}/pipeline/regenerate-combined`
2. Auth + ownership required.
3. Enqueues `regenerate_combined` mode.
4. Runs via draft artifact set and auto-promotes only on success.
5. Preserves existing overrides while replacing AI raw payload.

### Existing Orchestration GET Endpoints

Keep existing endpoints during transition:

1. [`combined_panecho_echoprime_api.py`](../../backend/app/api/orchestration_apis/combined_panecho_echoprime_api.py)
2. [`combined_dynamic_measurements_api.py`](../../backend/app/api/orchestration_apis/combined_dynamic_measurements_api.py)
3. [`llm_report_get_api.py`](../../backend/app/api/orchestration_apis/llm_report_get_api.py)

Final target behavior:

1. Read-only status/results.
2. No side-effect enqueue or stage progression.

## Upload and Append Strategy

### Upload Parse Start

1. `/upload-dicom` remains per-file ingest only.
2. After upload batch completes, frontend calls `pipeline/start` once.
3. This gives fast perceived performance without partial per-file kickoff races.

### Append Existing Study

1. New files increase study input revision.
2. `append_preview` run executes:
   1. Combined rerun on latest full study snapshot.
   2. Dynamics/Measurements only for newly eligible compatible instances (delta lane).
3. Draft results stay isolated until user promotes.

## Scheduler Design

### Runtime

1. In-process scheduler service starts with FastAPI.
2. Configurable worker slots.
3. Per-study mutex lock for strict stage order.
4. Cross-study concurrency controlled by config.

### Suggested Defaults

1. `PIPELINE_MAX_ACTIVE_STUDIES=1` on weak systems.
2. `PIPELINE_MAX_ACTIVE_STUDIES=2` on dual-5080 server (start conservative).
3. `PIPELINE_POLL_INTERVAL_MS=500`.

## Model Lifecycle and Performance Policy

### Env Strategy (Single `.env`)

Use one env file with profile/unload controls:

1. `INFERENCE_PROFILE=auto|low_vram|server`
2. `PIPELINE_UNLOAD_POLICY=stage|never`
3. `PIPELINE_MAX_ACTIVE_STUDIES=<int>`
4. `PIPELINE_POLL_INTERVAL_MS=<int>`

Keep explicit preload flags:

1. `PANECHO_PRELOAD`
2. `ECHOPRIME_PRELOAD`
3. `ECHONET_PRELOAD`
4. `MEASUREMENTS_PRELOAD`

Precedence:

1. Explicit preload flag wins.
2. Otherwise defaults derive from `INFERENCE_PROFILE`.
3. `PIPELINE_UNLOAD_POLICY` controls stage-end unload behavior.

### Required `.env.example` Comment Contract

1. Comment above each configurable variable group.
2. For every profile/control variable include:
   1. allowed values
   2. behavior impact
   3. recommended low-VRAM and server values
3. Keep device option comments (`auto | cpu | cuda:<index>`).

### Simple Pipeline (Low VRAM)

1. Load EchoPrime -> classify/views/metrics -> unload.
2. Load PanEcho -> infer -> unload.
3. Combine.
4. Load Dynamics model once -> run all eligible instances -> unload.
5. Load each Measurements weight once -> run all eligible instances for that weight -> unload weight.
6. Optional LLM stage.

### Simple Pipeline (Server)

1. Preload resident models.
2. Reuse resident models across studies with minimal unload.
3. Keep queue concurrency conservative and profile-driven.

## Planned Backend Additions (File Tree)

```text
backend/app/
|- api/
|  `- orchestration_apis/
|     |- pipeline_start_api.py            (new)
|     |- pipeline_status_api.py           (new)
|     |- pipeline_promote_api.py          (new)
|     |- pipeline_cancel_api.py           (new)
|     `- pipeline_regenerate_api.py       (new)
|- background_tasks/
|  `- pipeline_worker.py                  (new)
|- services/
|  |- pipeline_scheduler.py               (new)
|  `- pipeline_state_machine.py           (new)
|- helpers/
|  `- study_instance_routing.py           (new)
|- database_models/
|  |- pipeline_jobs.py                    (new)
|  |- pipeline_stage_runs.py              (new)
|  `- pipeline_artifact_sets.py           (new)
`- schemas/
   `- orchestration_apis/
      |- pipeline_start_schemas.py        (new)
      |- pipeline_status_schemas.py       (new)
      |- pipeline_promote_schemas.py      (new)
      |- pipeline_cancel_schemas.py       (new)
      `- pipeline_regenerate_schemas.py   (new)
```

## File-by-File Checklist (Backend)

### A) Data and schema

1. `backend/app/database_models/pipeline_jobs.py` (new)
2. `backend/app/database_models/pipeline_stage_runs.py` (new)
3. `backend/app/database_models/pipeline_artifact_sets.py` (new)
4. `backend/app/database_models/derived_results.py`
5. `backend/app/database_models/__init__.py`
6. `backend/app/database/setup_db.py`

### B) Config and startup

1. `backend/app/core/config.py`
2. `backend/app/main.py`
3. `backend/.env.example`

### C) Queue APIs

1. `backend/app/api/orchestration_apis/pipeline_start_api.py` (new)
2. `backend/app/api/orchestration_apis/pipeline_status_api.py` (new)
3. `backend/app/api/orchestration_apis/pipeline_promote_api.py` (new)
4. `backend/app/api/orchestration_apis/pipeline_cancel_api.py` (new)
5. `backend/app/api/orchestration_apis/pipeline_regenerate_api.py` (new)
6. `backend/app/api/orchestration_apis/__init__.py`

### D) Scheduler and worker

1. `backend/app/services/pipeline_scheduler.py` (new)
2. `backend/app/services/pipeline_state_machine.py` (new)
3. `backend/app/background_tasks/pipeline_worker.py` (new)

### E) Stage integrations

1. `backend/app/background_tasks/combining_panecho_echoprime.py`
2. `backend/app/background_tasks/combining_dynamic_measurements.py`
3. `backend/app/background_tasks/generate_llm_report.py`
4. `backend/app/helpers/study_status.py`

### F) Pre-filter/routing

1. `backend/app/helpers/study_instance_routing.py` (new)
2. `backend/app/helpers/view_classifier.py`
3. `backend/app/helpers/doppler_tags.py`

### G) Performance/IO cleanup

1. `backend/app/helpers/inference_functions.py`
2. `backend/app/api/inference/infer_echoprime_api.py`
3. `backend/app/api/inference/infer_panecho_api.py`
4. `backend/app/api/inference/infer_echonet_dynamic_api.py`
5. `backend/app/api/inference/infer_measurements_api.py`
6. `backend/app/AI_models/measurements/runner_2d.py`
7. `backend/app/AI_models/measurements/runner_doppler.py`

## Iteration Plan (Small, Manageable Steps)

### Iteration 1: Queue Foundation and Read-Only Observability

Focus:

1. Add queue tables (`pipeline_jobs`, `pipeline_stage_runs`).
2. Add scheduler skeleton with no model execution.
3. Add `pipeline/start` and `pipeline/status`.

Acceptance:

1. Study can enqueue idempotently.
2. Status reflects queue transitions.

### Iteration 2: Draft Artifact Boundary

Focus:

1. Add `pipeline_artifact_sets`.
2. Route stage writes into draft set.
3. Backfill existing active study-level artifacts into baseline `active` set records.
4. Keep current active results unchanged.

Acceptance:

1. Draft writes do not alter active read path.
2. Existing StudyResults data remains stable during preview jobs.

### Iteration 3: Promote and Cancel Semantics

Focus:

1. Add `pipeline/promote`.
2. Add `pipeline/cancel`.
3. Implement new-study cleanup and append-mode cleanup split.
4. Add cooperative cancellation checkpoints between heavy stage loops so running jobs stop cleanly.

Acceptance:

1. Promote atomically swaps active set.
2. Cancel behavior matches new-study vs append rules.
3. Mid-run cancel transitions to `cancelled` without leaving partially active artifacts.

### Iteration 4: Stage Worker Integration + Routing Gate

Focus:

1. Integrate prefilter/routing map.
2. Enforce confidence gate `>=0.75`.
3. Enforce spectral Doppler short-circuit.
4. Wire combined + dynamic/measurements + optional LLM through queue worker.

Acceptance:

1. Backend progresses without route/polling dependence.
2. Skip reasons are persisted and auditable.

### Iteration 5: Regenerate Combined + Override Preservation

Focus:

1. Add `pipeline/regenerate-combined`.
2. Preserve override map during combined persistence.
3. Replace AI raw payload only.

Acceptance:

1. Regenerate updates raw AI values.
2. Existing clinician overrides remain intact.

### Iteration 6: Legacy Trigger Neutralization (Backend Side)

Focus:

1. Convert legacy orchestration GETs to read-only behavior.
2. Keep temporary compatibility flag only if needed for frontend transition.
3. Expand integration tests for multi-user and failure propagation.

Acceptance:

1. No stage progression side effects on GET routes when feature flag is off.
2. Queue start path is explicit and deterministic.

### Iteration 7: Frontend Tie-In + Final Cleanup (Deferred)

Focus:

1. Wire NewStudy start/promote/cancel actions.
2. Wire StudyResults observer-only status model.
3. Use TanStack mutations for start/promote/cancel/regenerate actions and queries for observer-only status reads.
4. Remove all compatibility fallback and legacy trigger code.

Acceptance:

1. End-to-end flow works without legacy paths.
2. Legacy cleanup register empty before release.

## Testing Plan

### Unit

1. Queue idempotent start.
2. State machine transitions.
3. Routing/skip reason correctness.
4. Profile/unload policy selection.
5. Override merge behavior.

### Integration

1. Upload batch + start enqueues one job.
2. Processing continues with StudyResults closed.
3. Promote swaps draft to active.
4. Cancel applies correct cleanup path by mode.
5. LLM-enabled and LLM-disabled completion semantics.
6. Required stage failure sets study status `failed`.
7. Cross-user ownership checks block unauthorized access.
8. Mid-run cancel exits safely and does not leak draft artifacts into active view.

### Concurrency

1. Multiple users enqueue at same time.
2. Per-study stage order preserved.
3. No data leakage across users/studies.

### Performance

1. Compare low-vram and server profiles.
2. Validate reduced model churn from profile-aware load/unload policy.

## Order of Operations (Locked)

1. Implement backend queue architecture first.
2. Keep temporary fallback only where needed for safe frontend transition.
3. Wait for OHIF/frontend stabilization.
4. Integrate frontend to start/promote/cancel/status flow.
5. Run full validation on low-vram and server profiles.
6. Remove all temporary fallback/legacy paths before release.

Release rule:

1. No legacy stage-trigger code ships in release branch.

## Legacy Cleanup Register (Trim-at-End)

Track temporary compatibility paths and remove them before release.

Current known paths:

1. Side-effect stage triggering in:
   1. [`combined_panecho_echoprime_api.py`](../../backend/app/api/orchestration_apis/combined_panecho_echoprime_api.py)
   2. [`combined_dynamic_measurements_api.py`](../../backend/app/api/orchestration_apis/combined_dynamic_measurements_api.py)
   3. [`llm_report_get_api.py`](../../backend/app/api/orchestration_apis/llm_report_get_api.py)
2. Frontend queries that currently assume GET routes can drive progression:
   1. [`usePanechoEchoprimeResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/usePanechoEchoprimeResultsQuery.js)
   2. [`useDynamicMeasurementsResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/useDynamicMeasurementsResultsQuery.js)
   3. [`useLlmReportResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/useLlmReportResultsQuery.js)

Cleanup gate (all required):

1. No GET orchestration route enqueues jobs.
2. Queue start only through explicit pipeline endpoints/internal worker transitions.
3. Compatibility feature flags removed.
4. Legacy register items removed and verified in final cleanup PR.

## Acceptance Criteria (Final)

1. Processing continues regardless of page/app focus.
2. Queue is idempotent, user-owned, and multi-user safe.
3. Upload-phase results do not overwrite active data before explicit promotion.
4. Cancel semantics are correct for new-study and append flows.
5. Combined regenerate preserves clinician overrides.
6. Filtering/routing rules (`>=0.75`, spectral short-circuit, hard compatibility) are active and auditable.
7. Works on low-vram and server systems via `.env` controls.
