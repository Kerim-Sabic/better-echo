# Frontend Architecture

Last Updated: 2026-04-10  
Owner: Frontend

## Scope

Renderer structure, runtime-config boundary, MVVM layering, and the Study Results integration path.

## Frontend Tree

```text
frontend/src/
|- App.js
|- api/
|- config/
|- contexts/
|- features/
|  |- dashboard/
|  |- login/
|  |- new_study/
|  |- server_admin/
|  `- study_results/
|- general_components/
|- hooks/
|- lib/
`- __tests__/
```

## Routing and App Shell

The renderer shell lives in [`App.js`](../../frontend/src/App.js).

Primary routes:

1. `/` splash
2. `/login`
3. `/server-admin`
4. `/dashboard`
5. `/studies/new`
6. `/studies/:studyUid`

Route protection is handled by:

1. [`AuthenticationContext.jsx`](../../frontend/src/contexts/AuthenticationContext.jsx)
2. [`ProtectedRoute.jsx`](../../frontend/src/contexts/ProtectedRoute.jsx)

## Runtime Config Boundary

Desktop runtime config is a first-class renderer concern:

1. [`RuntimeConfigGate.jsx`](../../frontend/src/general_components/RuntimeConfigGate.jsx) blocks the client runtime until a valid remote server/viewer address exists.
2. [`useElectronRuntimeConfig.js`](../../frontend/src/hooks/useElectronRuntimeConfig.js) loads and provides Electron runtime config to the renderer.
3. [`api.js`](../../frontend/src/config/api.js) derives API and uploads base URLs from runtime config or env.

Client mode uses saved remote server settings. Server mode uses the local backend and packaged viewer managed by Electron.

## Feature Organization

Each feature is organized by responsibility:

1. `views/` for page and layout components
2. `components/` for feature-local presentational pieces
3. `viewmodels/` for orchestration hooks and UI behavior
4. `model/` for DTO and repository shaping
5. `tanstack/queries` and `tanstack/mutations` for request lifecycles

Examples:

1. Login: [`frontend/src/features/login/`](../../frontend/src/features/login/)
2. Dashboard: [`frontend/src/features/dashboard/`](../../frontend/src/features/dashboard/)
3. New Study: [`frontend/src/features/new_study/`](../../frontend/src/features/new_study/)
4. Study Results: [`frontend/src/features/study_results/`](../../frontend/src/features/study_results/)
5. Server Admin: [`frontend/src/features/server_admin/`](../../frontend/src/features/server_admin/)

## MVVM Rules

Renderer code follows a consistent split:

1. Views and layout components render props and callbacks only.
2. ViewModel hooks compose page-level state and actions.
3. Repository and DTO files normalize backend payloads.
4. TanStack hooks own request timing, polling, and cache invalidation.
5. Shared API wrappers under [`frontend/src/api/`](../../frontend/src/api/) stay thin and transport-oriented.

## Study Results Flow

Study Results centers on one page-level ViewModel:

1. [`useStudyResultsViewModel.js`](../../frontend/src/features/study_results/viewmodels/useStudyResultsViewModel.js)

Its dependencies are:

1. Queries:
   - [`useStudyAnalysisCombinedResultsQuery.js`](../../frontend/src/features/study_results/tanstack/queries/useStudyAnalysisCombinedResultsQuery.js)
   - [`useDynamicMeasurementsCombinedResultsQuery.js`](../../frontend/src/features/study_results/tanstack/queries/useDynamicMeasurementsCombinedResultsQuery.js)
   - [`useLlmReportResultsQuery.js`](../../frontend/src/features/study_results/tanstack/queries/useLlmReportResultsQuery.js)
   - [`useStudyDetailsQuery.js`](../../frontend/src/features/study_results/tanstack/queries/useStudyDetailsQuery.js)
2. Repository and DTO:
   - [`studyResultsRepository.js`](../../frontend/src/features/study_results/model/studyResultsRepository.js)
   - [`studyResults.dto.js`](../../frontend/src/features/study_results/model/studyResults.dto.js)
   - [`studyResults.constants.js`](../../frontend/src/features/study_results/model/studyResults.constants.js)
3. Edit workflow:
   - [`useStudyAnalysisEditorViewModel.js`](../../frontend/src/features/study_results/viewmodels/useStudyAnalysisEditorViewModel.js)
4. OHIF payload bridge:
   - [`ohifAiPayloadSerializer.js`](../../frontend/src/features/study_results/viewmodels/ohifAiPayloadSerializer.js)
5. Print/PDF path:
   - [`studyResultsPdfSerializer.js`](../../frontend/src/features/study_results/viewmodels/pdf_printing/studyResultsPdfSerializer.js)
   - [`studyResultsPdfGenerator.js`](../../frontend/src/features/study_results/viewmodels/pdf_printing/studyResultsPdfGenerator.js)

`EchocardiographyViewer.jsx` hosts the OHIF iframe and remounts it when the derived-DICOM refresh token changes, which is how the renderer picks up new derived series after study measurements complete.

Study Results feature availability is driven by study metadata:

1. [`useStudyDetailsQuery.js`](../../frontend/src/features/study_results/tanstack/queries/useStudyDetailsQuery.js) reads `llm_enabled`
2. [`useStudyResultsViewModel.js`](../../frontend/src/features/study_results/viewmodels/useStudyResultsViewModel.js) suppresses the AI Report lane when LLM is disabled
3. [`ohifAiPayloadSerializer.js`](../../frontend/src/features/study_results/viewmodels/ohifAiPayloadSerializer.js) passes that capability into the embedded OHIF panel

## Dashboard, Login, and New Study

Other page flows follow the same layering pattern:

1. Dashboard
   - page/views under [`frontend/src/features/dashboard/views/`](../../frontend/src/features/dashboard/views/)
   - state and actions under [`frontend/src/features/dashboard/viewmodels/`](../../frontend/src/features/dashboard/viewmodels/)
   - TanStack reads and mutations under [`frontend/src/features/dashboard/tanstack/`](../../frontend/src/features/dashboard/tanstack/)
2. Login
   - page/views under [`frontend/src/features/login/views/`](../../frontend/src/features/login/views/)
   - login and WebAuthn actions under [`frontend/src/features/login/viewmodels/`](../../frontend/src/features/login/viewmodels/)
3. New Study
   - upload page under [`frontend/src/features/new_study/views/`](../../frontend/src/features/new_study/views/)
   - upload/pipeline actions under [`frontend/src/features/new_study/tanstack/`](../../frontend/src/features/new_study/tanstack/)

## Shared Renderer Infrastructure

Shared renderer pieces live outside feature folders:

1. Global title bar, splash, runtime-config gate, and shared UI primitives under [`frontend/src/general_components/`](../../frontend/src/general_components/)
2. Shared API client and endpoint wrappers under [`frontend/src/api/`](../../frontend/src/api/)
3. Theme, branding, and WebAuthn helpers under [`frontend/src/lib/`](../../frontend/src/lib/)
4. Public branding asset URLs are resolved through [`branding.js`](../../frontend/src/lib/branding.js) so nested browser routes, print previews, and packaged `file://` renderer paths use the same logic

## Testing Surface

Frontend tests live in:

1. integration tests under [`frontend/src/__tests__/integration/`](../../frontend/src/__tests__/integration/)
2. feature-local test files when a feature owns its own contract or helper behavior

Run from repo root:

```powershell
npm run test:frontend
```

## Operational Boundaries

1. Renderer code never starts local backend or Docker services directly.
2. Runtime mode differences are expressed through runtime config and Electron APIs.
3. Backend payloads are normalized before they reach presentational components.
4. Study Results remains the highest-contract surface in the renderer and is the primary place where backend, viewer, and print paths meet.
