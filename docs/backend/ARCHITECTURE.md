# Backend Architecture

Last Updated: 2026-04-10  
Owner: Backend

## Scope

FastAPI application structure, persistence model, orchestration ownership, and backend runtime responsibilities.

## Backend Tree

```text
backend/app/
|- main.py
|- api/
|  |- admin/
|  |- authentication/
|  |- health/
|  |- inference/
|  |- licensing/
|  |- llm/
|  |- patients/
|  |- pipeline/
|  |- results/
|  |- studies/
|  `- upload_dicom/
|- core/
|- database/
|- database_models/
|- helpers/
|- schemas/
|- vendor_access/
`- services/
   |- auth/
   |- inference/
   |- integrations/
   |- licensing/
   |- pipeline/
   |- release/
   |- reporting/
   `- results/
```

## Entry Points

1. Application bootstrap and router registration: [`main.py`](../../backend/app/main.py)
2. Runtime configuration: [`config.py`](../../backend/app/core/config.py)
3. Runtime path resolution and logical model asset mapping for source vs packaged mode: [`runtime_paths.py`](../../backend/app/core/runtime_paths.py)
4. Canonical derived-result identifiers and public route segments: [`artifacts.py`](../../backend/app/core/artifacts.py)

## Router Groups

Registered from [`main.py`](../../backend/app/main.py):

1. Health: [`health_api.py`](../../backend/app/api/health/health_api.py)
2. Admin bootstrap and user management: [`backend/app/api/admin/`](../../backend/app/api/admin/)
3. Licensing: [`licensing_api.py`](../../backend/app/api/licensing/licensing_api.py)
4. Authentication and WebAuthn: [`backend/app/api/authentication/`](../../backend/app/api/authentication/)
5. DICOM upload: [`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py)
6. Studies and instances: [`backend/app/api/studies/`](../../backend/app/api/studies/)
7. Patient-by-study lookup: [`get_patient_by_study_uid_api.py`](../../backend/app/api/patients/get_patient_by_study_uid_api.py)
8. Direct inference routes: [`backend/app/api/inference/`](../../backend/app/api/inference/)
9. LLM routes: [`backend/app/api/llm/`](../../backend/app/api/llm/)
10. Observer result routes: [`backend/app/api/results/`](../../backend/app/api/results/)
11. Pipeline mutation and status routes: [`backend/app/api/pipeline/`](../../backend/app/api/pipeline/)
12. Packaged-server vendor access: [`backend/app/vendor_access/`](../../backend/app/vendor_access/)

## Data Model

Core clinical hierarchy:

1. `Patient` -> many `Study`
2. `Study` -> many `Series`
3. `Series` -> many `Instance`
4. `Study` and `Instance` -> many `DerivedResult`

Pipeline ownership:

1. `PipelineJob` stores queue-level state.
2. `PipelineStageRun` stores per-stage status and payload snapshots.
3. `PipelineArtifactSet` separates `draft`, `active`, and `discarded` result sets.

Primary models:

1. [`patients.py`](../../backend/app/database_models/patients.py)
2. [`studies.py`](../../backend/app/database_models/studies.py)
3. [`series.py`](../../backend/app/database_models/series.py)
4. [`instances.py`](../../backend/app/database_models/instances.py)
5. [`derived_results.py`](../../backend/app/database_models/derived_results.py)
6. [`pipeline_jobs.py`](../../backend/app/database_models/pipeline_jobs.py)
7. [`pipeline_stage_runs.py`](../../backend/app/database_models/pipeline_stage_runs.py)
8. [`pipeline_artifact_sets.py`](../../backend/app/database_models/pipeline_artifact_sets.py)

User activity fields:

1. `users.last_login_at` stores the latest successful hospital-user login timestamp.
2. Vendor access does not create any database user or vendor-specific audit row.

## Startup and Shutdown Lifecycle

Startup in [`main.py`](../../backend/app/main.py):

1. Initializes schema state with [`init_db`](../../backend/app/database/setup_db.py).
2. Runs packaged release identifier migration in release mode through [`run_release_identifier_migration`](../../backend/app/services/release/identifier_migration.py).
3. Logs current license status and applies licensing middleware.
4. Validates WebAuthn runtime safety.
5. Starts the in-process pipeline scheduler.
6. Emits LAN hints and configures CORS.
7. Preloads primary analysis, secondary analysis, motion segmentation, and study measurements according to env and VRAM guards.

Shutdown in [`main.py`](../../backend/app/main.py):

1. Stops the pipeline scheduler.
2. Terminates tracked ffmpeg processes.
3. Unloads secondary analysis, primary analysis, 2D measurements, and Doppler models.

## Upload and Persistence

Primary flow lives in [`upload_dicom_api.py`](../../backend/app/api/upload_dicom/upload_dicom_api.py):

1. Persist uploaded DICOM under the backend upload root.
2. Forward the instance to Orthanc.
3. Read DICOM tags required for patient/study/series/instance identity.
4. Upsert relational records in PostgreSQL.
5. Return a normalized upload response for the renderer.

Study deletion lives in [`delete_study_api.py`](../../backend/app/api/studies/delete_study_api.py):

1. Ownership is enforced before deletion.
2. Orthanc deletion is treated as idempotent when the remote study is already missing.
3. Local upload and derived-artifact folders are removed according to the study cleanup rules.

## Inference and Services

Route files stay thin and delegate execution into service modules:

1. Primary analysis: [`infer_primary_analysis_api.py`](../../backend/app/api/inference/infer_primary_analysis_api.py) -> [`primary_analysis_service.py`](../../backend/app/services/inference/primary_analysis_service.py)
2. Secondary analysis: [`infer_secondary_analysis_api.py`](../../backend/app/api/inference/infer_secondary_analysis_api.py) -> [`secondary_analysis_service.py`](../../backend/app/services/inference/secondary_analysis_service.py)
3. Motion segmentation: [`infer_motion_segmentation_api.py`](../../backend/app/api/inference/infer_motion_segmentation_api.py) -> [`motion_segmentation_service.py`](../../backend/app/services/inference/motion_segmentation_service.py)
4. Linear measurements: [`infer_linear_measurements_api.py`](../../backend/app/api/inference/infer_linear_measurements_api.py) -> [`linear_measurements_service.py`](../../backend/app/services/inference/linear_measurements_service.py)
5. Spectral measurements: [`infer_spectral_measurements_api.py`](../../backend/app/api/inference/infer_spectral_measurements_api.py) -> [`spectral_measurements_service.py`](../../backend/app/services/inference/spectral_measurements_service.py)

Derived result identifiers and public model names are centralized in [`artifacts.py`](../../backend/app/core/artifacts.py).

## Results and Pipeline Ownership

The backend owns orchestration end to end:

1. `pipeline/start` creates or reuses a study-owned queue job.
2. The scheduler advances `prefilter`, `combined`, `dynamic_measurements`, and optional `llm`.
3. Result GET routes are observer-only and never enqueue work.
4. Promote, cancel, and regenerate routes mutate draft and active artifact sets explicitly.

Canonical pipeline modules:

1. Queue service: [`service.py`](../../backend/app/services/pipeline/service.py)
2. Scheduler lifecycle: [`scheduler.py`](../../backend/app/services/pipeline/scheduler.py)
3. Result readers: [`read.py`](../../backend/app/services/pipeline/read.py)
4. Cleanup rules: [`cleanup.py`](../../backend/app/services/pipeline/cleanup.py)
5. Stage registry: [`registry.py`](../../backend/app/services/pipeline/internal/registry.py)
6. Stage handlers: [`backend/app/services/pipeline/stages/`](../../backend/app/services/pipeline/stages/)

Observer result routes:

1. Study analysis: [`combined_study_analysis_api.py`](../../backend/app/api/results/combined_study_analysis_api.py)
2. Study measurements: [`combined_dynamic_measurements_api.py`](../../backend/app/api/results/combined_dynamic_measurements_api.py)
3. LLM report: [`llm_report_get_api.py`](../../backend/app/api/results/llm_report_get_api.py)

## Licensing and Release Hardening

Licensing behavior is implemented by:

1. Middleware gate: [`middleware.py`](../../backend/app/services/licensing/middleware.py)
2. License state and validation: [`service.py`](../../backend/app/services/licensing/service.py)
3. Signing helpers: [`signing.py`](../../backend/app/services/licensing/signing.py)
4. Activation/import routes: [`licensing_api.py`](../../backend/app/api/licensing/licensing_api.py)

Packaged release startup also runs the identifier migration service in [`identifier_migration.py`](../../backend/app/services/release/identifier_migration.py) before the scheduler starts.

## Hidden Vendor Access

Packaged server builds can expose a hidden vendor access lane:

1. credentials are embedded at build time by [`generate_release_config.py`](../../backend/desktop/generate_release_config.py)
2. runtime injection is performed by [`launcher.py`](../../backend/desktop/launcher.py)
3. backend behavior is isolated under [`backend/app/vendor_access/`](../../backend/app/vendor_access/)
4. vendor access is read-only and does not persist a vendor account in PostgreSQL

## Observability and Runtime Paths

1. Backend logging is configured in [`main.py`](../../backend/app/main.py).
2. Source-mode logs live under `backend/app/logs`.
3. Packaged logs, cache, upload roots, config roots, prompt templates, and model asset roots are resolved through [`runtime_paths.py`](../../backend/app/core/runtime_paths.py).
4. Runtime inference code reads logical asset names from [`runtime_paths.py`](../../backend/app/core/runtime_paths.py) so source-mode filenames and packaged aliases stay decoupled.

## Operational Boundaries

1. Authentication, ownership checks, and license enforcement execute before protected study mutation and observer routes.
2. Orthanc, PostgreSQL, OHIF, and the optional LLM runtime are external dependencies from the FastAPI process perspective.
3. Device, batching, preload, and queue-concurrency knobs are defined in [`config.py`](../../backend/app/core/config.py).
