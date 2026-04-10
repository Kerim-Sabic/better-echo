# AI Pipelines and Orchestration

Last Updated: 2026-04-04  
Owner: AI/Backend

## Scope

How the backend pipeline is triggered, how stages persist artifacts, and how Study Results consumes those artifacts.

## Pipeline Stages

The queue stage order is defined in [`service.py`](../../backend/app/services/pipeline/service.py):

1. `prefilter`
2. `combined`
3. `dynamic_measurements`
4. optional `llm`

Stage handlers are resolved through [`registry.py`](../../backend/app/services/pipeline/internal/registry.py) and implemented under [`backend/app/services/pipeline/stages/`](../../backend/app/services/pipeline/stages/).

## Stage Responsibilities

### `prefilter`

Responsibilities:

1. validate study ownership and prerequisite records
2. run route and compatibility checks
3. classify views for study-analysis and study-measurements routing
4. short-circuit spectral Doppler candidates into the spectral lane

Primary implementation:

1. [`pipeline_routing.py`](../../backend/app/helpers/pipeline/pipeline_routing.py)

### `combined`

Responsibilities:

1. run primary and secondary analysis for eligible study instances
2. aggregate predictions into one study-analysis payload
3. persist the combined result row for the draft artifact set

Primary implementation:

1. [`combined.py`](../../backend/app/services/pipeline/stages/combined.py)

### `dynamic_measurements`

Responsibilities:

1. run motion segmentation where eligible
2. run linear measurements where eligible
3. run spectral measurements where eligible
4. persist study-level measurement workflow status plus per-instance derived artifacts

Primary implementation:

1. [`dynamic_measurements.py`](../../backend/app/services/pipeline/stages/dynamic_measurements.py)

### `llm`

Responsibilities:

1. build report context from completed study-analysis and study-measurements artifacts
2. generate the report through the configured LLM client
3. persist the report summary artifact

Primary implementation:

1. [`llm.py`](../../backend/app/services/pipeline/stages/llm.py)

## Trigger Model

Pipeline progression is backend-owned:

1. `POST /api/studies/{study_uid}/pipeline/start` creates or reuses a queue job.
2. `GET /api/studies/{study_uid}/pipeline/status` is observer-only.
3. `POST /api/studies/{study_uid}/pipeline/promote` promotes a completed draft artifact set.
4. `POST /api/studies/{study_uid}/pipeline/cancel` cancels or requests cancellation of the latest active job.
5. `POST /api/studies/{study_uid}/pipeline/regenerate-combined` runs a combined-only refresh against the active baseline.

Result routes remain observer-only:

1. `GET /api/studies/{study_uid}/study-analysis-results`
2. `GET /api/studies/{study_uid}/study-measurements-results`
3. `GET /api/studies/{study_uid}/llm-report-results`

## Persistence Model

Queue state:

1. `PipelineJob` stores one study-owned queue job.
2. `PipelineStageRun` stores per-stage status, payload snapshot, and failure detail.

Artifact state:

1. `PipelineArtifactSet` stores `draft`, `active`, and `discarded` result sets.
2. `DerivedResult` rows belong either to an artifact set or to rows without `artifact_set_id`.
3. Result readers in [`read.py`](../../backend/app/services/pipeline/read.py) resolve preview vs active reads for observer routes.

Public derived result identifiers are defined in [`artifacts.py`](../../backend/app/core/artifacts.py).

## Run Modes and Cleanup

Run modes:

1. upload preview
2. regenerate combined

Cleanup scopes:

1. `none`
2. `append_delta`
3. `new_study`

The queue service applies cleanup semantics through [`cleanup.py`](../../backend/app/services/pipeline/cleanup.py).

## Frontend Consumption

Study Results uses:

1. study-analysis observer query
2. study-measurements observer query
3. LLM report observer query
4. pipeline status query

Primary renderer files:

1. [`useStudyResultsViewModel.js`](../../frontend/src/features/study_results/viewmodels/useStudyResultsViewModel.js)
2. [`studyResultsRepository.js`](../../frontend/src/features/study_results/model/studyResultsRepository.js)
3. [`studyResults.dto.js`](../../frontend/src/features/study_results/model/studyResults.dto.js)
4. [`ohifAiPayloadSerializer.js`](../../frontend/src/features/study_results/viewmodels/ohifAiPayloadSerializer.js)
5. [`EchocardiographyViewer.jsx`](../../frontend/src/features/study_results/components/EchocardiographyViewer.jsx)

The renderer uses preview reads for live pipeline progress and remounts the viewer iframe when the derived-DICOM refresh token changes.

## LLM Prerequisites

The `llm` stage depends on:

1. a complete study-analysis artifact
2. a complete study-measurements artifact
3. `ENABLE_LLM=true`

Report generation is exposed both through pipeline completion and the explicit route in [`llm_report_generate_api.py`](../../backend/app/api/llm/llm_report_generate_api.py).

## Performance Controls

Runtime knobs are configured in [`config.py`](../../backend/app/core/config.py):

1. preload toggles and warmup flags
2. batch sizes
3. device preferences
4. queue poll interval
5. queue max active studies
6. view confidence threshold

The queue scheduler itself is started and stopped in [`main.py`](../../backend/app/main.py) through [`scheduler.py`](../../backend/app/services/pipeline/scheduler.py).

## Failure Semantics

1. Failed stage rows surface through pipeline status.
2. Observer result routes surface explicit failed rows or latest stage failure details.
3. Promote and regenerate operations enforce draft/active baseline rules at the queue-service level.
