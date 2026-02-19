# Backend Architecture

Last Updated: 2026-02-17  
Owner: Backend

## Scope

FastAPI application architecture, router composition, persistence model, and orchestration responsibilities.

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
|  `- orchestration_apis/
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
2. Authentication: [`login_api.py`](../../backend/app/api/authentication/login_api.py#L16) and [`webauthn/router.py`](../../backend/app/api/authentication/webauthn/router.py#L43)
3. Upload DICOM: [`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L74)
4. Studies: [`list_studies_api.py`](../../backend/app/api/studies/list_studies_api.py#L21) and [`retrieve_study_api.py`](../../backend/app/api/studies/retrieve_study_api.py#L18)
5. Patients: [`get_patient_by_study_uid_api.py`](../../backend/app/api/patients/get_patient_by_study_uid_api.py#L10)
6. Inference: [`infer_panecho_api.py`](../../backend/app/api/inference/infer_panecho_api.py#L24)
7. LLM: [`llm_report_generate_api.py`](../../backend/app/api/llm/llm_report_generate_api.py#L21)
8. Orchestration APIs: [`combined_panecho_echoprime_api.py`](../../backend/app/api/orchestration_apis/combined_panecho_echoprime_api.py#L29)

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

1. Configure CORS ([`main.py`](../../backend/app/main.py#L52))
2. Mount `/uploads` static path ([`main.py`](../../backend/app/main.py#L59))
3. Attempt model preloads with VRAM-aware guards ([`main.py`](../../backend/app/main.py#L71))

Shutdown behaviors in [`main.py`](../../backend/app/main.py):

1. Kill tracked ffmpeg processes ([`main.py`](../../backend/app/main.py#L124))
2. Unload EchoPrime when possible ([`main.py`](../../backend/app/main.py#L130))

## Upload and Persistence Flow

Primary implementation:

1. [`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L74)

Flow:

1. Receive and store uploaded DICOM ([`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L108))
2. Send DICOM to Orthanc ([`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L115))
3. Parse required tags ([`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L138))
4. Upsert patient/study/series/instance rows ([`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L168))
5. Return normalized upload response ([`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py#L214))

## Inference and Orchestration Flow

Direct inference routes:

1. PanEcho: [`infer_panecho_api.py`](../../backend/app/api/inference/infer_panecho_api.py#L24)
2. EchoPrime: [`infer_echoprime_api.py`](../../backend/app/api/inference/infer_echoprime_api.py#L129)
3. EchoNet Dynamic: [`infer_echonet_dynamic_api.py`](../../backend/app/api/inference/infer_echonet_dynamic_api.py#L91)
4. Measurements 2D: [`infer_measurements_api.py`](../../backend/app/api/inference/infer_measurements_api.py#L35)

Orchestration routes:

1. PanEcho+EchoPrime combined: [`combined_panecho_echoprime_api.py`](../../backend/app/api/orchestration_apis/combined_panecho_echoprime_api.py#L29)
2. PanEcho+EchoPrime overrides: [`combined_panecho_echoprime_api.py`](../../backend/app/api/orchestration_apis/combined_panecho_echoprime_api.py#L120)
3. Dynamic+Measurements combined: [`combined_dynamic_measurements_api.py`](../../backend/app/api/orchestration_apis/combined_dynamic_measurements_api.py#L28)
4. LLM report results: [`llm_report_get_api.py`](../../backend/app/api/orchestration_apis/llm_report_get_api.py#L35)

Persistence:

1. Artifacts are stored in `DerivedResult` ([`derived_results.py`](../../backend/app/database_models/derived_results.py#L12))
2. Combined/orchestration rows drive frontend polling via orchestration APIs.
3. Study-level dashboard status is derived from orchestration artifacts via [`study_status.py`](../../backend/app/helpers/study_status.py#L1)

Study status policy:

1. If any required artifact is `failed`, study status is `failed`.
2. Else if all required artifacts are `complete`, study status is `completed`.
3. Else study status is `processing`.
4. Required artifacts depend on backend `ENABLE_LLM`:
    1. Disabled: PanEcho+EchoPrime combined + Dynamic+Measurements combined.
    2. Enabled: PanEcho+EchoPrime combined + Dynamic+Measurements combined + LLM report.

## Error Handling and Observability

Current diagnostics:

1. Backend log setup: [`main.py`](../../backend/app/main.py#L36)
2. Backend log file path: [`horalix.log`](../../backend/app/logs/horalix.log)
3. Route-level HTTP statuses for pending/complete/error flows in orchestration handlers.
4. Startup preload logs for device/memory-aware behavior in [`main.py`](../../backend/app/main.py#L71)

## Backend Caveats

1. Local schema drift requires reset flow in local dev (see [`RUNBOOK.md`](../RUNBOOK.md#sqlite-schema-drift)).
2. Orthanc availability is an external dependency for upload/inference.
3. Batch/preload settings should be tuned per machine hardware in [`config.py`](../../backend/app/core/config.py#L18).
