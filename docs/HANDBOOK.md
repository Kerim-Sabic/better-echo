# Echocardiology App Handbook

Last Updated: 2026-02-16  
Audience: Engineering (current team + new developers/interns)

## Table of Contents

1. [Engineering Quick Links](#engineering-quick-links)
2. [System Summary](#system-summary)
3. [Repository Tree](#repository-tree)
4. [Architecture Map](#architecture-map)
5. [Core Workflows](#core-workflows)
6. [Common Tasks Index](#common-tasks-index)
7. [Source of Truth Matrix](#source-of-truth-matrix)
8. [Documentation Governance](#documentation-governance)

## Engineering Quick Links

Setup and operations:

1. [Root Quick Start](../README.md#quick-start-windows-first)
2. [Step-by-Step First Run](./ops/SETUP_FIRST_RUN.md#step-by-step)
3. [Runbook: Docker/Orthanc Not Available](./RUNBOOK.md#dockerorthanc-not-available)
4. [Runbook: SQLite Schema Drift](./RUNBOOK.md#sqlite-schema-drift)
5. [Runbook: LLM StartupShutdown Problems](./RUNBOOK.md#llm-startupshutdown-problems)

Architecture and contracts:

1. [API Groups and Endpoints](./API_SCHEMA_NOTES.md#api-groups-and-endpoints)
2. [Orchestration States](./API_SCHEMA_NOTES.md#orchestration-state-model)
3. [Backend Architecture](./backend/ARCHITECTURE.md#router-groups)
4. [Frontend MVVM Model](./frontend/ARCHITECTURE.md#mvvm-model-and-state-ownership)
5. [StudyResults Hook Chain](./frontend/ARCHITECTURE.md#studyresults-mvvm-hook-chain)
6. [StudyResults Measurement Composition](./frontend/ARCHITECTURE.md#studyresults-measurement-composition-details)
7. [Electron Lifecycle](./electron/ARCHITECTURE.md#runtime-lifecycle)
8. [AI Orchestration Pipeline](./ai-pipelines/ORCHESTRATION.md#pipeline-stages)
9. [LLM Context Enrichment Contract](./ai-pipelines/ORCHESTRATION.md#llm-context-enrichment-contract)
10. [Deterministic LLM Report Controls](./ai-pipelines/ORCHESTRATION.md#deterministic-llm-report-controls)
11. [Backend Queue Redesign Plan](./ai-pipelines/BACKEND_QUEUE_REWORK_PLAN.md)

Quality and planning:

1. [Current Tasks](./CURRENT_TASKS.md#active-queue)
2. [Testing Strategy](./testing/TESTING_STRATEGY.md)
3. [Style Guide](./STYLE_GUIDE.md)
4. [Doc Quality Checklist](./ops/DOC_QUALITY_CHECKLIST.md)
5. Full test matrix command: [`npm run test:all`](../package.json#L32)

## System Summary

Echocardiology App is a local-first desktop platform with four runtime layers:

1. Electron desktop shell and process lifecycle.
2. FastAPI backend for auth, uploads, inference, orchestration, and reporting.
3. React frontend with feature-based modules and MVVM hooks.
4. Orthanc for DICOM storage and viewer integration.

High-level behavior:

1. Upload DICOM studies.
2. Materialize patient/study/series/instance records.
3. Run and combine AI inference outputs.
4. Render results in StudyResults.
5. Generate optional LLM report from combined context.

## Repository Tree

Curated tree (2-3 levels + key files):

```text
Echocardiology_App/
|- backend/
|  |- app/
|  |  |- main.py
|  |  |- api/
|  |  |  |- authentication/
|  |  |  |- studies/
|  |  |  |- inference/
|  |  |  |- orchestration_apis/
|  |  |  |- llm/
|  |  |  `- upload_dicom/
|  |  |- database_models/
|  |  |- schemas/
|  |  |- background_tasks/
|  |  |- services/
|  |  `- helpers/
|  `- requirements.txt
|- frontend/
|  |- src/
|  |  |- App.js
|  |  |- api/
|  |  |- contexts/
|  |  |- pages/
|  |  |- components/
|  |  `- features/
|  |     |- Dashboard/
|  |     |- NewStudy/
|  |     `- StudyResults/
|  `- package.json
|- electron/
|  |- main.ts
|  |- preload.ts
|  |- ipc.ts
|  |- backend.ts
|  |- window.ts
|  `- electron-builder.config.js
|- scripts/
|  |- dev-start.bat / .ps1 / .sh
|  |- dev-start-with-llm.bat / .ps1 / .sh
|  `- build-all.bat / .sh
|- docs/
|  |- HANDBOOK.md
|  |- API_SCHEMA_NOTES.md
|  |- RUNBOOK.md
|  |- CURRENT_TASKS.md
|  `- ops/
`- package.json
```

## Architecture Map

1. Backend entrypoint and router wiring:
    1. [`main.py`](../backend/app/main.py#L49)
2. Frontend app shell and route map:
    1. [`App.js`](../frontend/src/App.js#L74)
3. Electron runtime lifecycle:
    1. [`main.ts`](../electron/main.ts#L60)
4. Detailed subsystem docs:
    1. [Backend Architecture](./backend/ARCHITECTURE.md)
    2. [Frontend Architecture](./frontend/ARCHITECTURE.md)
    3. [Electron Architecture](./electron/ARCHITECTURE.md)
    4. [AI Orchestration](./ai-pipelines/ORCHESTRATION.md)

## Core Workflows

### Upload and Study Materialization

1. Frontend uploads DICOM from New Study.
2. Backend upload API stores local file, forwards to Orthanc, parses tags, and upserts DB entities.
3. Dashboard list updates with study metadata and status.

Primary references:

1. [Upload API Notes](./API_SCHEMA_NOTES.md#study-and-upload-endpoints)
2. [Backend Upload Architecture](./backend/ARCHITECTURE.md#upload-and-persistence-flow)

### Orchestration and Polling

1. StudyResults queries orchestration endpoints.
2. Backend returns `202 pending` until artifacts are complete, then `200 complete`.
3. Frontend query hooks normalize polling states for ViewModels.

Primary references:

1. [Orchestration Endpoints](./API_SCHEMA_NOTES.md#orchestration-endpoints)
2. [Orchestration State Model](./API_SCHEMA_NOTES.md#orchestration-state-model)
3. [StudyResults Hook Chain](./frontend/ARCHITECTURE.md#studyresults-mvvm-hook-chain)

### LLM Report Generation

1. LLM orchestration endpoint waits for combined prerequisites.
2. Context includes `patient.sex` and per-measurement `range_status` before prompt build.
3. Deterministic report parameters (`temperature`, `top_p`, `seed`) are applied from backend config.
4. Report generation persists to `DerivedResult`.
5. StudyResults AI Report tab renders complete payload.

Primary references:

1. [LLM Endpoints](./API_SCHEMA_NOTES.md#llm-endpoints)
2. [LLM Triggering in Pipeline](./ai-pipelines/ORCHESTRATION.md#llm-report-stage)
3. [LLM Context Enrichment Contract](./ai-pipelines/ORCHESTRATION.md#llm-context-enrichment-contract)
4. [Deterministic LLM Report Controls](./ai-pipelines/ORCHESTRATION.md#deterministic-llm-report-controls)

## Common Tasks Index

Use these links when implementing common tasks:

1. Get study list with diagnoses:
    1. [API Recipe](./API_SCHEMA_NOTES.md#get-study-list-with-diagnoses)
2. Fetch study metadata for indexed mode:
    1. [API Recipe](./API_SCHEMA_NOTES.md#fetch-study-metadata-for-indexed-mode)
3. Trigger orchestration and detect readiness:
    1. [API Recipe](./API_SCHEMA_NOTES.md#trigger-orchestration-and-detect-ready-state)
4. Apply and persist measurement override:
    1. [API Recipe](./API_SCHEMA_NOTES.md#apply-and-persist-a-measurement-override)
    2. [Frontend Recipe](./frontend/ARCHITECTURE.md#persist-a-studyresults-measurement-override)
5. Regenerate LLM report after edits:
    1. [API Recipe](./API_SCHEMA_NOTES.md#regenerate-llm-report-after-measurement-edits)
6. Understand StudyResults MVVM composition:
    1. [Frontend MVVM Contracts](./frontend/ARCHITECTURE.md#mvvm-contracts-studyresults-core)
7. Understand StudyResults derived metrics and dual TRV/TRPG display:
    1. [Measurement Composition Details](./frontend/ARCHITECTURE.md#studyresults-measurement-composition-details)

## Source of Truth Matrix

Use this matrix to avoid duplicate/conflicting docs:

1. Setup and first run:
    1. [../README.md](../README.md)
    2. [./ops/SETUP_FIRST_RUN.md](./ops/SETUP_FIRST_RUN.md)
2. Runtime troubleshooting:
    1. [./RUNBOOK.md](./RUNBOOK.md)
3. API contracts and endpoint behavior:
    1. [./API_SCHEMA_NOTES.md](./API_SCHEMA_NOTES.md)
4. Architecture and module boundaries:
    1. [./HANDBOOK.md](./HANDBOOK.md)
    2. [./backend/ARCHITECTURE.md](./backend/ARCHITECTURE.md)
    3. [./frontend/ARCHITECTURE.md](./frontend/ARCHITECTURE.md)
    4. [./electron/ARCHITECTURE.md](./electron/ARCHITECTURE.md)
    5. [./ai-pipelines/ORCHESTRATION.md](./ai-pipelines/ORCHESTRATION.md)
5. Active implementation queue:
    1. [./CURRENT_TASKS.md](./CURRENT_TASKS.md)
6. Style and documentation standards:
    1. [./STYLE_GUIDE.md](./STYLE_GUIDE.md)
    2. [./ops/DOC_QUALITY_CHECKLIST.md](./ops/DOC_QUALITY_CHECKLIST.md)

## Documentation Governance

1. Keep docs concise, engineering-first, and implementation-oriented.
2. When runtime behavior/contracts/setup change, update docs in the same PR.
3. Prefer deep links to canonical sections over repeated duplicated text.
4. Keep section headings stable to avoid broken handbook anchors.
5. For implementation-critical code references, use clickable code links with `#L` anchors.
