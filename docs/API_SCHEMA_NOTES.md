# API Schema Notes

Last Updated: 2026-03-06  
Owner: Backend/API

## Scope

Engineering-facing reference for frontend/backend integration:

1. API groups and key endpoints.
2. Expected status semantics.
3. Payload fields consumed by frontend.
4. Common implementation recipes.

Base prefix:

1. `/api`

## API Groups and Endpoints

### Authentication Endpoints

Router path:

1. [`backend/app/api/authentication/`](../backend/app/api/authentication/)

Core:

1. `POST /api/login` ([`login_api.py`](../backend/app/api/authentication/login_api.py#L16))
2. `POST /api/logout` ([`logout_api.py`](../backend/app/api/authentication/logout_api.py#L9))
3. `GET /api/check-auth` ([`check_auth_api.py`](../backend/app/api/authentication/check_auth_api.py#L12))

WebAuthn:

1. `GET /api/webauthn/status` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L46))
2. `POST /api/webauthn/registration/start` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L77))
3. `POST /api/webauthn/registration/complete` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L123))
4. `POST /api/webauthn/authentication/start` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L196))
5. `POST /api/webauthn/authentication/complete` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L238))
6. `DELETE /api/webauthn/credentials/{credential_id}` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L335))

### Study and Upload Endpoints

Routers:

1. [`upload_dicom/`](../backend/app/api/upload_dicom/)
2. [`studies/`](../backend/app/api/studies/)
3. [`patients/`](../backend/app/api/patients/)

Key endpoints:

1. `POST /api/upload-dicom` ([`upload_dicom_api.py`](../backend/app/api/upload_dicom/upload_dicom_api.py#L74))
2. `GET /api/studies` ([`list_studies_api.py`](../backend/app/api/studies/list_studies_api.py#L21))
3. `GET /api/studies/{study_uid}` ([`retrieve_study_api.py`](../backend/app/api/studies/retrieve_study_api.py#L18))
4. `PATCH /api/studies/{study_id}` ([`update_study_api.py`](../backend/app/api/studies/update_study_api.py#L13))
5. `DELETE /api/studies/{study_id}` ([`delete_study_api.py`](../backend/app/api/studies/delete_study_api.py#L29))
6. `GET /api/studies/{study_uid}/instances` ([`list_instances_api.py`](../backend/app/api/studies/list_instances_api.py#L17))
7. `GET /api/{study_uid}/patient` ([`get_patient_by_study_uid_api.py`](../backend/app/api/patients/get_patient_by_study_uid_api.py#L10))

Path note:

1. Patient lookup is currently mounted directly under `/api` (not `/api/patients`).
2. Study and patient reads are ownership-scoped to the authenticated user (`404` on non-owned studies).

### Inference Endpoints

Router:

1. [`backend/app/api/inference/`](../backend/app/api/inference/)

Key endpoints:

1. `POST /api/infer/panecho` ([`infer_panecho_api.py`](../backend/app/api/inference/infer_panecho_api.py#L24))
2. `POST /api/infer/echoprime` (metrics-only pass) ([`infer_echoprime_api.py`](../backend/app/api/inference/infer_echoprime_api.py#L18))
3. `POST /api/infer/echoprime/views` (view-classification-only pass) ([`infer_echoprime_api.py`](../backend/app/api/inference/infer_echoprime_api.py#L40))
4. `POST /api/infer/echonet-dynamic/LV-segmentation` ([`infer_echonet_dynamic_api.py`](../backend/app/api/inference/infer_echonet_dynamic_api.py#L91))
5. `POST /api/infer/measurements/2d` ([`infer_measurements_api.py`](../backend/app/api/inference/infer_measurements_api.py#L35))
6. `GET /api/infer/measurements/doppler/tag-check` ([`infer_doppler_api.py`](../backend/app/api/inference/infer_doppler_api.py#L54))
7. `GET /api/infer/measurements/doppler/tag-audit/{study_uid}` ([`infer_doppler_api.py`](../backend/app/api/inference/infer_doppler_api.py#L78))
8. `POST /api/infer/measurements/doppler` ([`infer_doppler_api.py`](../backend/app/api/inference/infer_doppler_api.py#L139))

Doppler identification contract:

1. Spectral Doppler candidate detection is tag-based only.
2. Required spectral identifiers:
1. `(0018,6012) Region Spatial Format == 3`
2. `(0018,6014) Region Data Type in {3,4}`
3. Numeric conversion tags (`reference_line`, `physical_delta_y`, and model-dependent `physical_delta_x`) are validated before inference execution.

### AI Results and Pipeline Endpoints

Router:

1. [`backend/app/api/results/`](../backend/app/api/results/)
2. [`backend/app/api/pipeline/`](../backend/app/api/pipeline/)

Key endpoints:

1. `GET /api/studies/{study_uid}/PanEcho-EchoPrime-combined-results` ([`combined_panecho_echoprime_api.py`](../backend/app/api/results/combined_panecho_echoprime_api.py))
2. `PATCH /api/studies/{study_uid}/PanEcho-EchoPrime-overrides` ([`combined_panecho_echoprime_api.py`](../backend/app/api/results/combined_panecho_echoprime_api.py))
3. `GET /api/studies/{study_uid}/Dynamic-Measurements-combined-results` ([`combined_dynamic_measurements_api.py`](../backend/app/api/results/combined_dynamic_measurements_api.py))
4. `GET /api/studies/{study_uid}/llm-report-results` ([`llm_report_get_api.py`](../backend/app/api/results/llm_report_get_api.py))
5. `POST /api/studies/{study_uid}/pipeline/start` ([`pipeline_start_api.py`](../backend/app/api/pipeline/pipeline_start_api.py))
6. `GET /api/studies/{study_uid}/pipeline/status` ([`pipeline_status_api.py`](../backend/app/api/pipeline/pipeline_status_api.py))
7. `POST /api/studies/{study_uid}/pipeline/promote` ([`pipeline_promote_api.py`](../backend/app/api/pipeline/pipeline_promote_api.py))
8. `POST /api/studies/{study_uid}/pipeline/cancel` ([`pipeline_cancel_api.py`](../backend/app/api/pipeline/pipeline_cancel_api.py))
9. `POST /api/studies/{study_uid}/pipeline/regenerate-combined` ([`pipeline_regenerate_api.py`](../backend/app/api/pipeline/pipeline_regenerate_api.py))

Pipeline queue note (Iterations 1-5):

1. `pipeline/start` and `pipeline/status` are implemented as the backend queue foundation.
2. Queue worker executes server-owned stage progression (`prefilter`, `combined`, `dynamic_measurements`, optional `llm`).
3. AI result GET routes are observer-only in Iteration 6:
1. they read active/draft-derived results and status
2. they do not enqueue jobs or create pending marker rows
4. Iteration 2 draft boundary is active:
1. queue start creates a `draft` artifact set per job
2. status returns `artifact_sets.draft` and `artifact_sets.active`
3. legacy study-level results are backfilled into an `active` artifact set on queue start
5. Iteration 3 promote/cancel semantics are active:
1. `pipeline/promote` supports immediate promote or delayed promote-intent contract
2. `pipeline/cancel` supports queued/completed immediate cancel and running cooperative cancel request
3. cancel cleanup uses `cleanup_scope` (`none`, `append_delta`, `new_study`)
4. promote response semantics:
1. `200` immediate promote
2. `202` promote intent accepted (`auto_promote_on_complete`)
3. `409` no valid promote context
6. Iteration 4 routing gate is active:
1. hard DICOM compatibility checks
2. Doppler tag short-circuit
3. global confidence gate via `PIPELINE_VIEW_CONFIDENCE_MIN` (default `0.75`)
7. Iteration 5 regenerate flow is active:
1. `pipeline/regenerate-combined` enqueues regenerate mode explicitly
2. regenerate requires an active combined baseline
3. successful regenerate auto-promotes draft artifact set
4. failed regenerate leaves active artifact set unchanged
5. clinician overrides are preserved while raw AI values are refreshed
8. Orchestration result observers and pipeline mutations are ownership-scoped (`404` for non-owned study UID).

Combined PanEcho+EchoPrime compact-contract note:

1. The response still includes `integrated_tasks` temporarily for compatibility.
2. `display` is the render-ready frontend payload.
3. `edit_baselines` is the minimal AI baseline snapshot used for edit/save/reset logic:
1. numeric tasks expose `rawValue`
2. categorical tasks expose `label`
4. Public `overrides` are slimmed to `value` or `label`; audit fields remain internal to stored `value_json`.

Dynamic+Measurements observer payload note:

1. `GET /api/studies/{study_uid}/Dynamic-Measurements-combined-results` now returns a normalized observer payload instead of raw stage `value_json`.
2. Canonical complete/pending-preview payload shape:
1. `dynamic_measurements_results.instances[]`
2. `dynamic_measurements_results.meta`
3. Each instance exposes only:
1. `sop_instance_uid`
2. `instance_number`
3. `predicted_view`
4. `predicted_view_confidence`
5. `results`
4. Each result exposes only:
1. `task`
2. `ui_label`
3. `status`
4. `output_path`
5. `output_kind`
6. `message`
5. Backend infers `output_kind` from file extension when not persisted explicitly.
6. Backend also fills `ui_label` fallbacks when stage payload omits it.

### LLM Endpoints

Router:

1. [`backend/app/api/llm/`](../backend/app/api/llm/)

Key endpoints:

1. `POST /api/studies/{study_uid}/llm/report/generate` ([`llm_report_generate_api.py`](../backend/app/api/llm/llm_report_generate_api.py#L21))
2. `POST /api/llm/chat` ([`llm_chat_api.py`](../backend/app/api/llm/llm_chat_api.py#L26))

## Orchestration State Model

Frontend polling expects these semantics:

1. `200` + `{ status: "complete", ...results }`
2. `202` + `{ status: "pending", retry_after }`
3. `200` + `{ status: "failed", detail? }`
4. `404` for missing/study-not-found or disabled path

Frontend query wrappers normalize this into:

1. `isPending`
2. `isComplete`
3. `isFailed`
4. `results`
5. `retryAfter`

Reference implementations:

1. [`usePanechoEchoprimeResultsQuery.js`](../frontend/src/features/StudyResults/hooks/queries/usePanechoEchoprimeResultsQuery.js#L9)
2. [`useDynamicMeasurementsResultsQuery.js`](../frontend/src/features/StudyResults/hooks/queries/useDynamicMeasurementsResultsQuery.js#L9)
3. [`useLlmReportResultsQuery.js`](../frontend/src/features/StudyResults/hooks/queries/useLlmReportResultsQuery.js#L9)

## Key Payload Fields Consumed by Frontend

### Study List Item (`GET /api/studies`)

Critical fields:

1. `id`
2. `study_uid`
3. `study_date`
4. `status`
5. `uploaded_at`
6. `patient.*` (name/sex/birth/id)
7. `diagnoses` (optional extracted labels)

Not included in list payload:

1. `patient_height_cm`
2. `patient_weight_kg`
3. `heart_rate_bpm`

Frontend entrypoint:

1. [`listStudiesApi`](../frontend/src/api/StudiesApi.js) in [`StudiesApi.js`](../frontend/src/api/StudiesApi.js#L3)

Status semantics:

1. `processing`: one or more required orchestration artifacts are missing or pending.
2. `completed`: all required orchestration artifacts are complete.
3. `failed`: one or more required orchestration artifacts failed.
4. Required artifact set is environment-dependent:
1. `ENABLE_LLM=false`: PanEcho+EchoPrime combined + Dynamic+Measurements combined.
2. `ENABLE_LLM=true`: PanEcho+EchoPrime combined + Dynamic+Measurements combined + LLM report.
5. Study status returned by read endpoints is computed in read path and is not persisted by GET handlers.

### Study Detail (`GET /api/studies/{study_uid}`)

Critical fields:

1. `patient_height_cm`
2. `patient_weight_kg`
3. `heart_rate_bpm`
4. `patient.patient_sex`

Used by StudyResults indexed mode and derived display logic.

Canonical metadata source note:

1. Study detail is the canonical source for indexed-mode biometrics.

Frontend entrypoints:

1. [`getStudyByUidApi`](../frontend/src/api/StudiesApi.js) in [`StudiesApi.js`](../frontend/src/api/StudiesApi.js#L8)
2. [`useStudyMetaQuery.js`](../frontend/src/features/StudyResults/hooks/queries/useStudyMetaQuery.js#L9)

## Common Tasks (API Recipes)

### Get Study List with Diagnoses

Goal:

1. Fetch dashboard list including diagnosis labels.

Use:

1. Frontend call: [`listStudiesApi`](../frontend/src/api/StudiesApi.js) in [`StudiesApi.js`](../frontend/src/api/StudiesApi.js#L3)
2. Backend endpoint: `GET /api/studies`
3. Backend implementation: [`list_studies_api.py`](../backend/app/api/studies/list_studies_api.py#L22)

Returns:

1. Array of study objects with `diagnoses: string[]` (possibly empty).

Caveats:

1. `diagnoses` depends on completed LLM result availability.

### Fetch Study Metadata for Indexed Mode

Goal:

1. Load sex/height/weight/heart rate for measurement display logic.

Use:

1. Hook: [`useStudyMetaQuery`](../frontend/src/features/StudyResults/hooks/queries/useStudyMetaQuery.js) in [`useStudyMetaQuery.js`](../frontend/src/features/StudyResults/hooks/queries/useStudyMetaQuery.js#L9)
2. Endpoint: `GET /api/studies/{study_uid}`

Returns:

1. Normalized hook data:
1. `patientName`
2. `patientSex`
3. `patientHeightCm`
4. `patientWeightKg`
5. `heartRateBpm`

Caveats:

1. Missing height/weight disables indexing mode.
2. Use study detail for biometrics; study list intentionally omits these fields.

### Trigger Orchestration and Detect Ready State

Goal:

1. Start backend queue orchestration, then poll observer-only result/status endpoints.

Use:

1. Start endpoint:
1. `POST /api/studies/{study_uid}/pipeline/start`
2. AI result observers:
1. API wrappers:
1. [`getPanechoEchoprimeCombinedResults`](../frontend/src/api/results/PanechoEchoprimeResultsApi.js#L10)
2. [`getDynamicMeasurementsCombinedResults`](../frontend/src/api/results/DynamicMeasurementsResultsApi.js#L10)
3. [`getLlmReportResults`](../frontend/src/api/results/LlmReportResultsApi.js#L10)
3. Query hooks:
1. [`usePanechoEchoprimeResultsQuery`](../frontend/src/features/StudyResults/hooks/queries/usePanechoEchoprimeResultsQuery.js#L9)
2. [`useDynamicMeasurementsResultsQuery`](../frontend/src/features/StudyResults/hooks/queries/useDynamicMeasurementsResultsQuery.js#L9)
3. [`useLlmReportResultsQuery`](../frontend/src/features/StudyResults/hooks/queries/useLlmReportResultsQuery.js#L9)

Returns:

1. Normalized query data:
1. `isPending`
2. `isComplete`
3. `results`
4. `retryAfter`

Caveats:

1. Keep polling logic aligned with `202 pending` semantics.
2. Legacy orchestration GET endpoints are observer-only and do not trigger progression.
3. Queue progression starts from explicit `pipeline/start` calls.
4. Result observers are ownership-scoped and return `404` for non-owned studies.

### Start Backend-Owned Pipeline Job

Goal:

1. Enqueue an idempotent orchestration job once per study.

Use:

1. Endpoint: `POST /api/studies/{study_uid}/pipeline/start`
2. Backend implementation: [`pipeline_start_api.py`](../backend/app/api/pipeline/pipeline_start_api.py)
3. Queue service: [`service.py`](../backend/app/services/pipeline/service.py)

Returns:

1. `created_new`
2. `job_id`
3. current queue `status`

### Observe Pipeline Job Status

Goal:

1. Read job/stage progress without side effects.

Use:

1. Endpoint: `GET /api/studies/{study_uid}/pipeline/status`
2. Backend implementation: [`pipeline_status_api.py`](../backend/app/api/pipeline/pipeline_status_api.py)

Returns:

1. `has_job`
2. `pipeline` snapshot (`status`, `current_stage`, stage list, timestamps, last_error)
3. `pipeline.artifact_sets`:
1. `draft` set linked to current queue job
2. `active` set representing clinician-visible baseline
4. cancellation fields:
1. `pipeline.cancel_requested_at`
2. `pipeline.is_cancel_requested`

### Promote Draft Artifact Set

Goal:

1. Promote latest completed draft result set into active view.

Use:

1. Endpoint: `POST /api/studies/{study_uid}/pipeline/promote`
2. Backend implementation: [`pipeline_promote_api.py`](../backend/app/api/pipeline/pipeline_promote_api.py)

Returns:

1. `state` (`promoted` or `pending`)
2. `job_id`
3. `promoted_artifact_set_id` (nullable for pending)
4. `discarded_artifact_set_id` (nullable)
5. `retry_after` (set when state is pending)

Status handling:

1. `200` when promoted now or already active.
2. `202` when promote intent is recorded for running/queued job.
3. `409` when no promotable draft and no active job context exists.

### Cancel Pipeline Job

Goal:

1. Cancel preview pipeline work and apply cleanup by scope.

Use:

1. Endpoint: `POST /api/studies/{study_uid}/pipeline/cancel`
2. Backend implementation: [`pipeline_cancel_api.py`](../backend/app/api/pipeline/pipeline_cancel_api.py)

Returns:

1. `cancel_requested=true` for cooperative cancel of running jobs
2. `status=cancelled` for immediate queued/completed cancellation
3. cleanup summary counts for applied delete operations

### Delete Study (Idempotent Orthanc semantics)

Goal:

1. Delete local/DB study data even when Orthanc already removed the remote study.

Use:

1. Endpoint: `DELETE /api/studies/{study_id}`
2. Backend implementation: [`delete_study_api.py`](../backend/app/api/studies/delete_study_api.py#L29)
3. Orthanc helper: [`delete_study_from_orthanc_status`](../backend/app/services/integrations/orthanc_client.py#L57)

Behavior:

1. Orthanc `200` => continue delete.
2. Orthanc `404` => treat as already deleted and continue.
3. Other Orthanc error => fail delete request and keep DB row unchanged.

### Regenerate Combined (Override-Safe)

Goal:

1. Recompute combined raw AI values while preserving clinician overrides.

Use:

1. Endpoint: `POST /api/studies/{study_uid}/pipeline/regenerate-combined`
2. Backend implementation: [`pipeline_regenerate_api.py`](../backend/app/api/pipeline/pipeline_regenerate_api.py)
3. Queue service: [`service.py`](../backend/app/services/pipeline/service.py)

Returns:

1. idempotent queue response (`created_new`, `job_id`, `status`)

Caveats:

1. Request fails with `409` if no active combined baseline exists.
2. On success, queue worker auto-promotes regenerate draft set.
3. On failure, currently active artifact set remains unchanged.

### Apply and Persist a Measurement Override

Goal:

1. Save doctor edit for combined PanEcho+EchoPrime task.

Use:

1. API call: [`updatePanechoEchoprimeOverrides`](../frontend/src/api/results/PanechoEchoprimeResultsApi.js#L25)
2. Endpoint: `PATCH /api/studies/{study_uid}/PanEcho-EchoPrime-overrides`
3. Backend implementation: [`combined_panecho_echoprime_api.py`](../backend/app/api/results/combined_panecho_echoprime_api.py)

Returns:

1. Complete combined payload with updated overrides.

Caveats:

1. Backend enforces value-vs-label validation by task type.
2. Combined results must already be complete (`409` otherwise).

### Regenerate LLM Report After Measurement Edits

Goal:

1. Trigger fresh LLM report generation after data changes.

Use:

1. API call: [`generateLlmReport`](../frontend/src/api/results/LlmReportResultsApi.js#L24)
2. Endpoint: `POST /api/studies/{study_uid}/llm/report/generate`
3. Poll endpoint: `GET /api/studies/{study_uid}/llm-report-results`
4. Backend generator: [`llm_report_generate_api.py`](../backend/app/api/llm/llm_report_generate_api.py#L22)

Returns:

1. Generation endpoint response (200/2xx success, or controlled error statuses).
2. Poll endpoint eventually returns `200 complete` with `llm_report`.

Caveats:

1. LLM must be enabled and prerequisites must be complete.

## Change Safety Rules

If endpoint shape changes:

1. Update backend schema + route serializer.
2. Update corresponding frontend API wrapper.
3. Update query `select` normalizers and ViewModel mapping.
4. Update this file in the same PR.

