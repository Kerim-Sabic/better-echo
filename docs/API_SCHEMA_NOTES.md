# API Schema Notes

Last Updated: 2026-02-17  
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

1. `GET /api/auth/webauthn/status` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L43))
2. `POST /api/auth/webauthn/options/register` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L74))
3. `POST /api/auth/webauthn/register` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L120))
4. `POST /api/auth/webauthn/options/authenticate` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L193))
5. `POST /api/auth/webauthn/authenticate` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L235))
6. `DELETE /api/auth/webauthn/credentials/{credential_id}` ([`webauthn/router.py`](../backend/app/api/authentication/webauthn/router.py#L332))

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

### Inference Endpoints

Router:

1. [`backend/app/api/inference/`](../backend/app/api/inference/)

Key endpoints:

1. `POST /api/infer/panecho` ([`infer_panecho_api.py`](../backend/app/api/inference/infer_panecho_api.py#L24))
2. `POST /api/infer/echoprime` ([`infer_echoprime_api.py`](../backend/app/api/inference/infer_echoprime_api.py#L129))
3. `POST /api/infer/echonet-dynamic/LV-segmentation` ([`infer_echonet_dynamic_api.py`](../backend/app/api/inference/infer_echonet_dynamic_api.py#L91))
4. `POST /api/infer/measurements/2d` ([`infer_measurements_api.py`](../backend/app/api/inference/infer_measurements_api.py#L35))

### Orchestration Endpoints

Router:

1. [`backend/app/api/orchestration_apis/`](../backend/app/api/orchestration_apis/)

Key endpoints:

1. `GET /api/studies/{study_uid}/PanEcho-EchoPrime-combined-results` ([`combined_panecho_echoprime_api.py`](../backend/app/api/orchestration_apis/combined_panecho_echoprime_api.py#L29))
2. `PATCH /api/studies/{study_uid}/PanEcho-EchoPrime-overrides` ([`combined_panecho_echoprime_api.py`](../backend/app/api/orchestration_apis/combined_panecho_echoprime_api.py#L120))
3. `GET /api/studies/{study_uid}/Dynamic-Measurements-combined-results` ([`combined_dynamic_measurements_api.py`](../backend/app/api/orchestration_apis/combined_dynamic_measurements_api.py#L28))
4. `GET /api/studies/{study_uid}/llm-report-results` ([`llm_report_get_api.py`](../backend/app/api/orchestration_apis/llm_report_get_api.py#L35))

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

1. Start or continue orchestration and stop polling when complete.

Use:

1. API wrappers:
1. [`getPanechoEchoprimeCombinedResults`](../frontend/src/api/orchestration_apis/PanechoEchoprimeResultsApi.js#L10)
2. [`getDynamicMeasurementsCombinedResults`](../frontend/src/api/orchestration_apis/DynamicMeasurementsResultsApi.js#L10)
3. [`getLlmReportResults`](../frontend/src/api/orchestration_apis/LlmReportResultsApi.js#L10)
2. Query hooks:
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

### Apply and Persist a Measurement Override

Goal:

1. Save doctor edit for combined PanEcho+EchoPrime task.

Use:

1. API call: [`updatePanechoEchoprimeOverrides`](../frontend/src/api/orchestration_apis/PanechoEchoprimeResultsApi.js#L26)
2. Endpoint: `PATCH /api/studies/{study_uid}/PanEcho-EchoPrime-overrides`
3. Backend implementation: [`combined_panecho_echoprime_api.py`](../backend/app/api/orchestration_apis/combined_panecho_echoprime_api.py#L124)

Returns:

1. Complete combined payload with updated overrides.

Caveats:

1. Backend enforces value-vs-label validation by task type.
2. Combined results must already be complete (`409` otherwise).

### Regenerate LLM Report After Measurement Edits

Goal:

1. Trigger fresh LLM report generation after data changes.

Use:

1. API call: [`generateLlmReport`](../frontend/src/api/orchestration_apis/LlmReportResultsApi.js#L26)
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
