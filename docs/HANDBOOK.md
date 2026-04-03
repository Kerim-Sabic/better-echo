# Echocardiology App Handbook

Last Updated: 2026-03-18  
Audience: Engineering

## Quick Links

1. [Root Quick Start](../README.md#quick-start-windows-first)
2. [First Run Setup](./ops/SETUP_FIRST_RUN.md)
3. [Runbook](./RUNBOOK.md)
4. [API Schema Notes](./API_SCHEMA_NOTES.md)
5. [Backend Architecture](./backend/ARCHITECTURE.md)
6. [Frontend Architecture](./frontend/ARCHITECTURE.md)
7. [Electron Architecture](./electron/ARCHITECTURE.md)
8. [AI Orchestration](./ai-pipelines/ORCHESTRATION.md)
9. [Testing Strategy](./testing/TESTING_STRATEGY.md)
10. [Style Guide](./STYLE_GUIDE.md)
11. [Doc Quality Checklist](./ops/DOC_QUALITY_CHECKLIST.md)

## System Summary

Echocardiology App is a desktop system with these runtime layers:

1. Electron for desktop lifecycle and packaged runtime.
2. FastAPI for auth, uploads, inference, orchestration, and reporting.
3. React for the frontend UI and StudyResults experience.
4. PostgreSQL for active backend persistence.
5. Orthanc for DICOM storage and viewer integration.

Main behavior:

1. Upload DICOM studies.
2. Persist patient, study, series, and instance metadata.
3. Run backend-owned AI orchestration.
4. Render combined results in StudyResults.
5. Generate optional LLM reports from combined context.

## Repository Map

```text
Echocardiology_App/
|- backend/
|- frontend/
|- electron/
|- scripts/
|- docs/
`- package.json
```

## Core Workflows

### Upload and Study Materialization

1. Frontend uploads DICOM from New Study.
2. Backend stores metadata, forwards to Orthanc, and writes DB records.
3. Dashboard and StudyResults read the persisted study state.

References:

1. [Study and Upload Endpoints](./API_SCHEMA_NOTES.md#study-and-upload-endpoints)
2. [Upload and Persistence Flow](./backend/ARCHITECTURE.md#upload-and-persistence-flow)

### Orchestration and Results

1. Frontend starts the backend pipeline with `POST /api/studies/{study_uid}/pipeline/start`.
2. Backend scheduler advances pipeline stages server-side.
3. StudyResults reads observer-only status and result endpoints.
4. Promote, cancel, and regenerate actions use explicit pipeline mutation routes.

References:

1. [AI Results and Pipeline Endpoints](./API_SCHEMA_NOTES.md#ai-results-and-pipeline-endpoints)
2. [Orchestration State Model](./API_SCHEMA_NOTES.md#orchestration-state-model)
3. [Pipeline Stages](./ai-pipelines/ORCHESTRATION.md#pipeline-stages)

### LLM Report Generation

1. LLM report generation waits for combined prerequisites.
2. Backend builds normalized LLM context from combined results.
3. Backend persists the report as a derived result.
4. Frontend renders the normalized LLM payload.

References:

1. [LLM Endpoints](./API_SCHEMA_NOTES.md#llm-endpoints)
2. [LLM Report Stage](./ai-pipelines/ORCHESTRATION.md#llm-report-stage)
3. [LLM Context Enrichment Contract](./ai-pipelines/ORCHESTRATION.md#llm-context-enrichment-contract)

## Source of Truth

1. Setup and first run:
   [../README.md](../README.md), [SETUP_FIRST_RUN.md](./ops/SETUP_FIRST_RUN.md)
2. Runtime troubleshooting:
   [RUNBOOK.md](./RUNBOOK.md)
3. API contracts:
   [API_SCHEMA_NOTES.md](./API_SCHEMA_NOTES.md)
4. Architecture:
   [backend/ARCHITECTURE.md](./backend/ARCHITECTURE.md), [frontend/ARCHITECTURE.md](./frontend/ARCHITECTURE.md), [electron/ARCHITECTURE.md](./electron/ARCHITECTURE.md), [ai-pipelines/ORCHESTRATION.md](./ai-pipelines/ORCHESTRATION.md)
5. Testing:
   [TESTING_STRATEGY.md](./testing/TESTING_STRATEGY.md)
6. Standards:
   [STYLE_GUIDE.md](./STYLE_GUIDE.md), [DOC_QUALITY_CHECKLIST.md](./ops/DOC_QUALITY_CHECKLIST.md)

## Documentation Rules

1. Keep `docs/` factual and current-state only.
2. Keep setup, runtime, contract, and architecture changes in sync with code.
3. Keep plans, branch notes, and personal task boards outside canonical docs.
