# Backend Architecture

Last Updated: 2026-03-10  
Owner: Backend

## Scope

FastAPI application architecture, router composition, persistence model, and AI results/pipeline responsibilities.

## Backend Tree

Curated tree:

```text
backend/app/
|- main.py
|- api/
|  |- authentication/
|  |- health/
|  |- upload_dicom/
|  |- studies/
|  |- patients/
|  |- inference/
|  |- llm/
|  |- pipeline/
|  `- results/
|- database_models/
|- schemas/
|- background_tasks/
|- services/
|- helpers/
`- configs/
```

## Entry Points

1. App bootstrap: [`main.py`](../../backend/app/main.py#L49)
2. Router group modules: [`api/`](../../backend/app/api/) (registered in [`main.py`](../../backend/app/main.py#L62))
3. ORM models: [`database_models/`](../../backend/app/database_models/)
4. Pydantic schemas: [`schemas/`](../../backend/app/schemas/)

## Router Groups

Registered in [`main.py`](../../backend/app/main.py#L62):

1. Health: [`health_api.py`](../../backend/app/api/health/health_api.py#L5)
2. Authentication: [`login_api.py`](../../backend/app/api/authentication/login_api.py#L16) and [`webauthn/router.py`](../../backend/app/api/authentication/webauthn/router.py#L46)
3. Upload DICOM: [`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L74)
4. Studies: [`list_studies_api.py`](../../backend/app/api/studies/list_studies_api.py#L21) and [`retrieve_study_api.py`](../../backend/app/api/studies/retrieve_study_api.py#L18)
5. Patients: [`get_patient_by_study_uid_api.py`](../../backend/app/api/patients/get_patient_by_study_uid_api.py#L10)
6. Inference: [`infer_panecho_api.py`](../../backend/app/api/inference/infer_panecho_api.py#L24)
7. LLM: [`llm_report_generate_api.py`](../../backend/app/api/llm/llm_report_generate_api.py#L21)
8. AI Results: [`api/results/`](../../backend/app/api/results/)
9. Pipeline: [`api/pipeline/`](../../backend/app/api/pipeline/)

## Data Model Highlights

Core entity graph:

1. `Patient` -> many `Study`
2. `Study` -> many `Series`
3. `Series` -> many `Instance`
4. `Study` -> many `DerivedResult`

Model definitions:

1. [`patients.py`](../../backend/app/database_models/patients.py#L5)
2. [`studies.py`](../../backend/app/database_models/studies.py#L6)
3. [`series.py`](../../backend/app/database_models/series.py#L5)
4. [`instances.py`](../../backend/app/database_models/instances.py#L6)
5. [`derived_results.py`](../../backend/app/database_models/derived_results.py#L12)

`Study` fields used by frontend display and indexing:

1. `patient_height_cm` ([`studies.py`](../../backend/app/database_models/studies.py#L16))
2. `patient_weight_kg` ([`studies.py`](../../backend/app/database_models/studies.py#L17))
3. `heart_rate_bpm` ([`studies.py`](../../backend/app/database_models/studies.py#L18))

## Startup and Shutdown Lifecycle

Startup behaviors in [`main.py`](../../backend/app/main.py):

1. Configure CORS with env allowlist plus detected LAN origin support for same-network dev.
2. Suppress high-volume uvicorn access logs for poll-heavy endpoints in terminal output.
3. Mount `/uploads` static path.
4. Start backend-owned pipeline scheduler loop.
5. Attempt model preloads with VRAM-aware guards.

Shutdown behaviors in [`main.py`](../../backend/app/main.py):

1. Stop pipeline scheduler.
2. Kill tracked ffmpeg processes.
3. Unload EchoPrime, PanEcho, and measurements models when possible.

## Upload and Persistence Flow

Primary implementation:

1. [`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L74)

Flow:

1. Receive and store uploaded DICOM ([`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L108))
2. Send DICOM to Orthanc ([`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L115))
3. Parse required tags ([`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L138))
4. Upsert patient/study/series/instance rows ([`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L168))
5. Return normalized upload response ([`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L214))

Delete semantics:

1. Study delete is ownership-scoped and transactional in [`delete_study_api.py`](../../backend/app/api/studies/delete_study_api.py#L29).
2. Orthanc `404` during delete is treated as idempotent success (already deleted remotely).
3. Local study cleanup includes uploads, LV segmentation, 2D measurements, Doppler outputs, and LLM reports under `app/uploads`.

## Inference and Queue/Results Flow

Direct inference routes:

1. PanEcho: [`infer_panecho_api.py`](../../backend/app/api/inference/infer_panecho_api.py#L24)
2. EchoPrime: [`infer_echoprime_api.py`](../../backend/app/api/inference/infer_echoprime_api.py#L129)
3. EchoNet Dynamic: [`infer_echonet_dynamic_api.py`](../../backend/app/api/inference/infer_echonet_dynamic_api.py#L91)
4. Measurements 2D: [`infer_measurements_api.py`](../../backend/app/api/inference/infer_measurements_api.py#L35)

AI result routes:

1. PanEcho+EchoPrime combined + overrides: [`combined_panecho_echoprime_api.py`](../../backend/app/api/results/combined_panecho_echoprime_api.py)
2. Dynamic+Measurements combined: [`combined_dynamic_measurements_api.py`](../../backend/app/api/results/combined_dynamic_measurements_api.py)
3. LLM report results: [`llm_report_get_api.py`](../../backend/app/api/results/llm_report_get_api.py)
4. Pipeline start/status/promote/cancel/regenerate routes under [`api/pipeline/`](../../backend/app/api/pipeline/)

Persistence:

1. Artifacts are stored in `DerivedResult` ([`derived_results.py`](../../backend/app/database_models/derived_results.py#L12))
2. Combined/result rows drive frontend polling via AI result APIs.
3. Study-level dashboard status is derived from orchestration artifacts via [`study_status.py`](../../backend/app/helpers/pipeline/study_status.py#L1)

Study status policy:

1. If any required artifact is `failed`, study status is `failed`.
2. Else if all required artifacts are `complete`, study status is `completed`.
3. Else study status is `processing`.
4. Required artifacts depend on backend `ENABLE_LLM`:
    1. Disabled: PanEcho+EchoPrime combined + Dynamic+Measurements combined.
    2. Enabled: PanEcho+EchoPrime combined + Dynamic+Measurements combined + LLM report.
5. `GET /api/studies` and `GET /api/studies/{study_uid}` compute effective status on read and do not commit status mutations.

Ownership policy:

1. Study routes, patient-by-study route, and orchestration observer routes are all user-scoped.
2. Non-owned `study_uid` access returns `404` to avoid cross-user data exposure.

## Canonical Pipeline Services

Canonical runtime service modules now live under `backend/app/services/pipeline/`:

1. Queue service: [`service.py`](../../backend/app/services/pipeline/service.py#L1)
2. Scheduler lifecycle: [`scheduler.py`](../../backend/app/services/pipeline/scheduler.py#L1)
3. Result readers: [`read.py`](../../backend/app/services/pipeline/read.py#L1)
4. Cleanup semantics: [`cleanup.py`](../../backend/app/services/pipeline/cleanup.py#L1)
5. Stage handlers: [`stages/`](../../backend/app/services/pipeline/stages/)
6. Internal queue helpers: [`internal/`](../../backend/app/services/pipeline/internal/)

## Canonical Integration and Reporting Services

Canonical non-pipeline services now live in domain folders:

1. LLM client: [`integrations/llm_client.py`](../../backend/app/services/integrations/llm_client.py)
2. Orthanc client: [`integrations/orthanc_client.py`](../../backend/app/services/integrations/orthanc_client.py)
3. LLM report service: [`reporting/llm_report_service.py`](../../backend/app/services/reporting/llm_report_service.py)
4. WebAuthn support modules: [`auth/webauthn/`](../../backend/app/services/auth/webauthn/)

## Error Handling and Observability

Current diagnostics:

1. Backend log setup: [`main.py`](../../backend/app/main.py#L36)
2. Backend log file path: [`horalix.log`](../../backend/app/logs/horalix.log)
3. Route-level HTTP statuses for pending/complete/error flows in orchestration handlers.
4. Startup preload logs for device/memory-aware behavior in [`main.py`](../../backend/app/main.py#L71)

PostgreSQL runtime profile:

1. Runtime DB connection is driven by `DATABASE_URL` in [`config.py`](../../backend/app/core/config.py).
2. Engine uses `pool_pre_ping=True` in [`db.py`](../../backend/app/database/db.py).
3. Backend tests use a dedicated `TEST_DATABASE_URL` and clear that DB between tests.

## Backend Caveats

1. Local schema/bootstrap issues should follow the Postgres runbook flows in [`RUNBOOK.md`](../RUNBOOK.md#postgresql-schema-bootstrap-or-reset).
2. Orthanc availability is an external dependency for upload/inference.
3. Batch/preload settings should be tuned per machine hardware in [`config.py`](../../backend/app/core/config.py#L18).

