# Horalix Pulse Handbook

Last Updated: 2026-04-06  
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
11. [Docs Maintenance](./DOCS_MAINTENANCE.md)
12. [Doc Quality Checklist](./ops/DOC_QUALITY_CHECKLIST.md)

## System Summary

The repository builds two Electron products:

1. `Horalix Pulse` client for login, dashboard, upload, and Study Results UI against a configured remote server.
2. `Horalix Pulse Server` for local backend execution, managed Docker infrastructure, and packaged clinical inference.

The runtime stack is:

1. Electron for desktop lifecycle, runtime-mode selection, tray, preload bridge, and packaged startup.
2. FastAPI for authentication, upload, admin, licensing, inference, orchestration, and reporting.
3. React for renderer UI and Study Results workflows.
4. PostgreSQL for backend persistence.
5. Orthanc for DICOM storage and viewer integration.
6. OHIF viewer for study viewing and derived-output review.

## Repository Map

```text
Echocardiology_App/
|- backend/
|- frontend/
|- electron/
|- horalix_viewer/
|- scripts/
|- docs/
`- package.json
```

## Core Workflows

### Desktop Startup

1. Electron resolves runtime mode from packaged metadata or environment in [`runtime.ts`](../electron/runtime.ts).
2. Server mode runs preflight, managed Docker infrastructure, local backend startup, and optional LLM startup from [`main.ts`](../electron/main.ts).
3. Client mode skips local services and uses persisted runtime configuration from [`ipc.ts`](../electron/ipc.ts) and [`RuntimeConfigGate.jsx`](../frontend/src/general_components/RuntimeConfigGate.jsx).

See:

1. [Electron Architecture](./electron/ARCHITECTURE.md)
2. [First Run Setup](./ops/SETUP_FIRST_RUN.md)

### Upload and Study Materialization

1. New Study uploads DICOM files through [`upload_dicom_api.py`](../backend/app/api/upload_dicom/upload_dicom_api.py).
2. Backend stores files, forwards them to Orthanc, and persists patient/study/series/instance rows.
3. Dashboard and Study Results read normalized study state through study endpoints in [`studies/`](../backend/app/api/studies/).

See:

1. [Backend Architecture](./backend/ARCHITECTURE.md#upload-and-persistence)
2. [API Schema Notes](./API_SCHEMA_NOTES.md#study-upload-and-patient-endpoints)

### Pipeline and Results

1. The frontend enqueues server-owned orchestration with `POST /api/studies/{study_uid}/pipeline/start`.
2. The in-process scheduler executes `prefilter`, `combined`, `dynamic_measurements`, and optional `llm` stages.
3. Study Results reads observer-only result endpoints for study analysis, study measurements, and LLM report payloads.
4. Promote, cancel, and regenerate actions operate on draft and active artifact sets.

See:

1. [AI Orchestration](./ai-pipelines/ORCHESTRATION.md)
2. [API Schema Notes](./API_SCHEMA_NOTES.md#results-and-pipeline-endpoints)
3. [Frontend Architecture](./frontend/ARCHITECTURE.md#study-results-flow)

### Reporting and Print

1. Study Results builds a normalized print snapshot from backend result contracts in [`useStudyResultsViewModel.js`](../frontend/src/features/study_results/viewmodels/useStudyResultsViewModel.js).
2. PDF generation uses [`studyResultsPdfSerializer.js`](../frontend/src/features/study_results/viewmodels/pdf_printing/studyResultsPdfSerializer.js) and [`studyResultsPdfGenerator.js`](../frontend/src/features/study_results/viewmodels/pdf_printing/studyResultsPdfGenerator.js).
3. Electron handles preview PDF generation through the preload bridge defined in [`preload.ts`](../electron/preload.ts).

### Admin and Licensing

1. Admin bootstrap and user management live under [`backend/app/api/admin/`](../backend/app/api/admin/).
2. Licensing status, activation request export, and license import live under [`backend/app/api/licensing/`](../backend/app/api/licensing/).
3. Packaged server startup applies licensing middleware from [`middleware.py`](../backend/app/services/licensing/middleware.py) before protected API routes execute.
4. Packaged server builds can expose a hidden read-only vendor access lane backed by [`backend/app/vendor_access/`](../backend/app/vendor_access/) and the isolated renderer feature under [`frontend/src/features/vendor_access/`](../frontend/src/features/vendor_access/).

See:

1. [API Schema Notes](./API_SCHEMA_NOTES.md#admin-endpoints)
2. [API Schema Notes](./API_SCHEMA_NOTES.md#licensing-endpoints)

## Source of Truth

1. Setup and local startup: [Root README](../README.md), [First Run Setup](./ops/SETUP_FIRST_RUN.md)
2. Runtime troubleshooting: [Runbook](./RUNBOOK.md)
3. API and payload contracts: [API Schema Notes](./API_SCHEMA_NOTES.md)
4. Architecture: [Backend Architecture](./backend/ARCHITECTURE.md), [Frontend Architecture](./frontend/ARCHITECTURE.md), [Electron Architecture](./electron/ARCHITECTURE.md), [AI Orchestration](./ai-pipelines/ORCHESTRATION.md)
5. Testing: [Testing Strategy](./testing/TESTING_STRATEGY.md)
6. Standards: [Style Guide](./STYLE_GUIDE.md), [Docs Maintenance](./DOCS_MAINTENANCE.md), [Doc Quality Checklist](./ops/DOC_QUALITY_CHECKLIST.md)

## Documentation Rules

1. `docs/` describes the current system only.
2. Behavior, setup, route, and payload changes update these docs in the same workstream.
3. Personal notes, migration diaries, and planning trackers stay out of `docs/`.
