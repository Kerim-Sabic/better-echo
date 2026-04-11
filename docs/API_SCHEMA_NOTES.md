# API Schema Notes

Last Updated: 2026-04-10  
Owner: Backend/API

## Scope

Canonical integration reference for backend routes and the payloads consumed by the renderer.

Base prefix:

1. `/api`

## Authentication Endpoints

Router modules:

1. [`backend/app/api/authentication/`](../backend/app/api/authentication/)
2. [`backend/app/api/authentication/webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py)

Core endpoints:

1. `POST /api/login`
2. `POST /api/logout`
3. `GET /api/check-auth`

WebAuthn endpoints:

1. `GET /api/webauthn/status`
2. `POST /api/webauthn/registration/start`
3. `POST /api/webauthn/registration/complete`
4. `POST /api/webauthn/authentication/start`
5. `POST /api/webauthn/authentication/complete`
6. `DELETE /api/webauthn/credentials/{credential_id}`

Frontend clients:

1. [`frontend/src/api/authentication/`](../frontend/src/api/authentication/)
2. [`frontend/src/api/webauthn/`](../frontend/src/api/webauthn/)

## Admin Endpoints

Router module:

1. [`backend/app/api/admin/`](../backend/app/api/admin/)

Endpoints:

1. `GET /api/admin/setup-status`
2. `POST /api/admin/bootstrap-user`
3. `GET /api/admin/users`
4. `POST /api/admin/users`
5. `PUT /api/admin/users/{user_id}`
6. `DELETE /api/admin/users/{user_id}`

Frontend clients:

1. [`frontend/src/api/admin/`](../frontend/src/api/admin/)

## Licensing Endpoints

Router module:

1. [`licensing_api.py`](../backend/app/api/licensing/licensing_api.py)

Endpoints:

1. `GET /api/licensing/status`
2. `GET /api/licensing/activation-request`
3. `POST /api/licensing/import`

Frontend clients:

1. [`frontend/src/api/licensing/`](../frontend/src/api/licensing/)

## Vendor Access Endpoints

Packaged-server-only router:

1. [`backend/app/vendor_access/`](../backend/app/vendor_access/)

Endpoints:

1. `GET /api/vendor-access/studies`
2. `GET /api/vendor-access/users/activity`
3. `GET /api/vendor-access/logs/tail`

Frontend clients:

1. [`frontend/src/api/vendor_access/`](../frontend/src/api/vendor_access/)
2. [`frontend/src/features/vendor_access/`](../frontend/src/features/vendor_access/)

## Study, Upload, and Patient Endpoints

Router modules:

1. [`upload_dicom_api.py`](../backend/app/api/upload_dicom/upload_dicom_api.py)
2. [`backend/app/api/studies/`](../backend/app/api/studies/)
3. [`get_patient_by_study_uid_api.py`](../backend/app/api/patients/get_patient_by_study_uid_api.py)

Key endpoints:

1. `POST /api/upload-dicom`
2. `GET /api/studies`
3. `GET /api/studies/{study_uid}`
4. `PATCH /api/studies/{study_id}`
5. `DELETE /api/studies/{study_id}`
6. `GET /api/studies/{study_uid}/instances`
7. `GET /api/{study_uid}/patient`

Path note:

1. Patient lookup is mounted directly under `/api/{study_uid}/patient`.

Study detail fields used by the renderer:

1. `patient_height_cm`
2. `patient_weight_kg`
3. `heart_rate_bpm`
4. `llm_enabled`
5. `patient.patient_name`
6. `patient.patient_sex`
7. `patient.patient_birth_date`

Frontend clients:

1. [`frontend/src/api/studies/`](../frontend/src/api/studies/)
2. [`frontend/src/api/patients/getPatientByStudyUidApi.js`](../frontend/src/api/patients/getPatientByStudyUidApi.js)
3. [`frontend/src/api/upload_dicom/uploadDicomApi.js`](../frontend/src/api/upload_dicom/uploadDicomApi.js)

## Inference Endpoints

Router module:

1. [`backend/app/api/inference/`](../backend/app/api/inference/)

Endpoints:

1. `POST /api/infer/primary-analysis`
2. `POST /api/infer/secondary-analysis`
3. `POST /api/infer/secondary-analysis/views`
4. `POST /api/infer/motion-segmentation/lv`
5. `POST /api/infer/measurements/2d`
6. `GET /api/infer/measurements/doppler/tag-check`
7. `GET /api/infer/measurements/doppler/tag-audit/{study_uid}`
8. `POST /api/infer/measurements/doppler`

Execution ownership:

1. Route handlers validate input and delegate into service modules under [`backend/app/services/inference/`](../backend/app/services/inference/).

## Results and Pipeline Endpoints

Result route segments are defined in [`artifacts.py`](../backend/app/core/artifacts.py).

Observer result endpoints:

1. `GET /api/studies/{study_uid}/study-analysis-results`
2. `PATCH /api/studies/{study_uid}/study-analysis-overrides`
3. `GET /api/studies/{study_uid}/study-measurements-results`
4. `GET /api/studies/{study_uid}/llm-report-results`

Pipeline endpoints:

1. `POST /api/studies/{study_uid}/pipeline/start`
2. `GET /api/studies/{study_uid}/pipeline/status`
3. `POST /api/studies/{study_uid}/pipeline/promote`
4. `POST /api/studies/{study_uid}/pipeline/cancel`
5. `POST /api/studies/{study_uid}/pipeline/regenerate-combined`

### Observer Semantics

Result GET routes are observer-only:

1. they read existing active or draft artifacts
2. they do not create jobs
3. they do not advance stages

Status semantics:

1. `200 + status=complete` when the payload is ready
2. `202 + status=pending` when work is still in progress
3. `200 + status=failed` when the latest row or queue stage failed
4. `404` when the study is not owned by the caller or the feature is unavailable

Each result GET route accepts `preview=true|false`:

1. `preview=true` reads the latest draft artifact set when one exists
2. `preview=false` reads the active artifact set

The frontend study-results wrappers under [`frontend/src/api/get_study_results_apis/`](../frontend/src/api/get_study_results_apis/) use preview reads for live pipeline progress.

LLM-off behavior:

1. `GET /api/studies/{study_uid}` exposes `llm_enabled`
2. the renderer suppresses the LLM report lane when `llm_enabled=false`
3. `GET /api/studies/{study_uid}/llm-report-results` still returns `404` when LLM is disabled

### Study Analysis Payload

Schema:

1. [`combined_study_analysis_schemas.py`](../backend/app/schemas/results/combined_study_analysis_schemas.py)

`status=complete` payload:

1. `analysis_results.edit_baselines`
2. `analysis_results.overrides`
3. `analysis_results.overrides_updated_at`
4. `analysis_results.display.mainMeasurements`
5. `analysis_results.display.Measurements`
6. `analysis_results.display.totalMeasurements`

Frontend consumers:

1. [`studyResultsRepository.js`](../frontend/src/features/study_results/model/studyResultsRepository.js)
2. [`studyResults.dto.js`](../frontend/src/features/study_results/model/studyResults.dto.js)
3. [`useStudyAnalysisEditorViewModel.js`](../frontend/src/features/study_results/viewmodels/useStudyAnalysisEditorViewModel.js)

### Study Measurements Payload

Schema:

1. [`combined_dynamic_measurements_schemas.py`](../backend/app/schemas/results/combined_dynamic_measurements_schemas.py)

`status=complete` and `status=pending` payload field:

1. `measurement_results`

Structure:

1. `measurement_results.instances[]`
2. `measurement_results.meta`

Each instance exposes:

1. `sop_instance_uid`
2. `instance_number`
3. `predicted_view`
4. `predicted_view_confidence`
5. `results[]`

Each result item exposes:

1. `task`
2. `ui_label`
3. `status`
4. `output_path`
5. `output_kind`
6. `message`
7. optional `derived_dicom`

Frontend consumers:

1. [`studyResults.dto.js`](../frontend/src/features/study_results/model/studyResults.dto.js)
2. [`EchocardiographyViewer.jsx`](../frontend/src/features/study_results/components/EchocardiographyViewer.jsx)

### LLM Report Payload

Schema:

1. [`llm_report_get_api_schemas.py`](../backend/app/schemas/results/llm_report_get_api_schemas.py)

`status=complete` payload field:

1. `llm_report`

Frontend consumers:

1. [`studyResults.dto.js`](../frontend/src/features/study_results/model/studyResults.dto.js)
2. [`ohifAiPayloadSerializer.js`](../frontend/src/features/study_results/viewmodels/ohifAiPayloadSerializer.js)

### Pipeline Status Payload

Schema:

1. [`pipeline_status_schemas.py`](../backend/app/schemas/pipeline/pipeline_status_schemas.py)

Top-level fields:

1. `has_job`
2. `pipeline`

`pipeline` includes:

1. `job_id`
2. `status`
3. `current_stage`
4. `run_mode`
5. `cleanup_scope`
6. `queued_at`, `started_at`, `finished_at`, `updated_at`
7. `cancel_requested_at`
8. `is_cancel_requested`
9. `uploaded_instance_uids`
10. `stages[]`
11. `artifact_sets.draft`
12. `artifact_sets.active`

### Pipeline Mutation Payloads

Schemas:

1. Start: [`pipeline_start_schemas.py`](../backend/app/schemas/pipeline/pipeline_start_schemas.py)
2. Promote: [`pipeline_promote_schemas.py`](../backend/app/schemas/pipeline/pipeline_promote_schemas.py)
3. Cancel: [`pipeline_cancel_schemas.py`](../backend/app/schemas/pipeline/pipeline_cancel_schemas.py)
4. Regenerate: [`pipeline_regenerate_schemas.py`](../backend/app/schemas/pipeline/pipeline_regenerate_schemas.py)

Behavior:

1. `pipeline/start` is idempotent per study and run mode.
2. `pipeline/promote` returns `200` for immediate promote and `202` for promote intent.
3. `pipeline/cancel` returns either immediate cancellation or a cooperative cancel request.
4. `pipeline/regenerate-combined` enqueues a regenerate run against the active combined baseline.

Frontend clients:

1. [`frontend/src/api/pipeline/PipelineApi.js`](../frontend/src/api/pipeline/PipelineApi.js)
2. [`frontend/src/api/ai_inference_pipeline_apis/`](../frontend/src/api/ai_inference_pipeline_apis/)

## LLM Endpoints

Router module:

1. [`backend/app/api/llm/`](../backend/app/api/llm/)

Endpoints:

1. `POST /api/studies/{study_uid}/llm/report/generate`
2. `POST /api/llm/chat`

Frontend mutation:

1. [`postGenerateLlmReportApi.js`](../frontend/src/api/llm_report_generate/postGenerateLlmReportApi.js)

## Ownership and Access Rules

1. Study, patient, pipeline, and result routes are ownership-scoped.
2. Non-owned study access returns `404`.
3. Licensing middleware gates protected routes before business logic executes.
4. Packaged-server vendor access can read any study through principal-aware read endpoints, but vendor requests remain blocked from all write endpoints.

## Change Rule

If a route, payload, or field changes:

1. update the backend serializer or schema
2. update the frontend wrapper or DTO
3. update this file in the same workstream
