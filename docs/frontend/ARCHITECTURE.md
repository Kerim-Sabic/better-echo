# Frontend Architecture

Last Updated: 2026-03-10  
Owner: Frontend

## Scope

Engineering reference for frontend structure, MVVM layering, StudyResults hook contracts, and common implementation recipes.

## Frontend Module Tree

Curated tree (2-3 levels + key files):

```text
frontend/src/
|- App.js
|- api/
|  |- authentication/
|  |- patients/
|  |- pipeline/
|  |- results/
|  |- studies/
|  |- upload_dicom/
|  |- webauthn/
|  `- client.js
|- contexts/
|  |- AuthenticationContext.jsx
|  `- ProtectedRoute.jsx
|- pages/
|  |- Login.jsx
|  |- Dashboard.jsx
|  |- NewStudy.jsx
|  `- StudyResults.jsx
|- components/
|  |- TitleBar.jsx
|  |- SplashScreen.jsx
|  `- ui/button.jsx
|- features/
|  |- Dashboard/
|  |  |- components/
|  |  `- hooks/
|  |- NewStudy/
|  `- StudyResults/
|     |- components/
|     |- hooks/
|     |  `- queries/
|     |  `- mutations/
|     `- helpers/
`- __tests__/
   `- integration/
```

## Entry Points and Routing

Primary app shell:

1. [`App.js`](../../frontend/src/App.js#L74)

Main routes:

1. `/` splash ([`App.js`](../../frontend/src/App.js#L53))
2. `/login` ([`App.js`](../../frontend/src/App.js#L56))
3. `/dashboard` ([`App.js`](../../frontend/src/App.js#L60))
4. `/studies/new` ([`App.js`](../../frontend/src/App.js#L61))
5. `/studies/:studyUid` ([`App.js`](../../frontend/src/App.js#L62))

Auth and route guards:

1. [`AuthenticationContext.jsx`](../../frontend/src/contexts/AuthenticationContext.jsx)
2. [`ProtectedRoute.jsx`](../../frontend/src/contexts/ProtectedRoute.jsx)

## MVVM Model and State Ownership

### Layer Definitions

1. View:
1. Components/layouts render props and callbacks.
2. ViewModel:
1. Feature hooks compose UI-ready state and action handlers.
3. Query/Data:
1. Query hooks isolate API calls, polling, and normalization.
4. Helpers:
1. Pure transformations and formatting utilities.

### Ownership Rules

1. API responses are normalized in query hooks, not directly in view components.
2. Cross-query orchestration state is aggregated in viewmodel-level hooks.
3. Edit/persistence handlers live in feature viewmodel hooks, not presentational components.
4. Layout components should remain stateless except UI interaction wiring.

## StudyResults MVVM Hook Chain

Execution chain:

1. [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js#L8)
1. Pulls study meta + pipeline status query + observer result queries.
2. Computes page state (`loading|pending|ready|not_found|error`) with status-first precedence.
3. Exposes normalized results and utility handlers (`refresh`, `onPrint`).
2. [`useAiMeasurementsViewModel.js`](../../frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js#L14)
1. Builds measurement sections from integrated tasks + overrides.
2. Manages edit draft state and override persistence.
3. Handles indexed mode logic with BSA and sex-aware ranges.
3. [`useAiSegmentationsViewModel.js`](../../frontend/src/features/StudyResults/hooks/useAiSegmentationsViewModel.js#L1)
1. Maps dynamic measurement result instances for display.
4. [`useLlmReportViewModel.js`](../../frontend/src/features/StudyResults/hooks/useLlmReportViewModel.js#L4)
1. Handles report state/actions for AI report tab.
5. [`useStudyResults.js`](../../frontend/src/features/StudyResults/hooks/useStudyResults.js#L39)
1. Composes all above into final page ViewModel contract.
6. [`StudyResultsLayout.jsx`](../../frontend/src/features/StudyResults/layouts/StudyResultsLayout.jsx#L9)
1. Renders tabs/panes and delegates interactions via ViewModel callbacks.

Primary files:

1. [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js#L8)
2. [`useAiMeasurementsViewModel.js`](../../frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js#L14)
3. [`useStudyResults.js`](../../frontend/src/features/StudyResults/hooks/useStudyResults.js#L39)
4. [`StudyResultsLayout.jsx`](../../frontend/src/features/StudyResults/layouts/StudyResultsLayout.jsx#L9)

## MVVM Contracts StudyResults Core

### `useStudyResultsData(studyUid)` returns

1. Global state:
1. `state`, `error`, `anyLoading`, `isPolling`
2. Query states:
1. `panEchoEchoprimeState`
2. `dynamicMeasurementsState`
3. `llmReportState`
3. Result payloads:
1. `panechoEchoprimeResults`
2. `dynamicMeasurementsResults`
3. `llmReportResults`
4. Metadata:
1. `patientName`
2. `patientSex`
3. `patientHeightCm`
4. `patientWeightKg`
5. `heartRateBpm`
5. Actions:
1. `refresh()`
2. `onPrint(options)`

Reference:

1. [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js#L275)

### `useAiMeasurementsViewModel(...)` returns

1. Rendering state:
1. `state`, `showLoading`, `isEmpty`
2. Measurement payloads:
1. `mainMeasurements`
2. `Measurements`
3. Indexed mode controls:
1. `isIndexedMode`
2. `canIndex`
3. `bsa`
4. Edit flow:
1. `editingKey`
2. `draftOverrides`
3. `fieldErrors`
4. `savingKey`
5. Actions:
1. `onSetIndexedMode`
2. `onStartEdit`
3. `onChangeValue`
4. `onChangeLabel`
5. `onStopEdit`
6. `onClearOverride`

Reference:

1. [`useAiMeasurementsViewModel.js`](../../frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js#L314)

## StudyResults Measurement Composition Details

Primary source:

1. StudyResults now consumes backend-owned `panecho_echoprime_results.display` in [`useAiMeasurementsViewModel.js`](../../frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js).
2. Backend builds the canonical display payload in [`combined_measurements_presenter.py`](../../backend/app/services/results/combined_measurements_presenter.py).

Backend-owned display behavior:

1. Derived metrics (`relative_wall_thickness`, `max_aortic_gradient`, `cardiac_output`) are computed server-side before the payload reaches the frontend.
2. EF discrepancy handling is backend-owned; frontend renders the backend-selected display value and discrepancy flag.
3. `TRV` is treated as a derived measurement from `tvpkgrad`, so `TRV` and `TRPG` now arrive as separate normal items instead of a frontend-only dual-value variant.
4. Color/range/category logic is backend-owned through the measurement display catalog and presenter stack.

Indexed/raw mode implications:

1. Indexing is enabled only when BSA is available from study metadata ([`useAiMeasurementsViewModel.js`](../../frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js#L61)).
2. Display in indexed mode is now a thin frontend transform in [`applyIndexedMeasurementDisplay.js`](../../frontend/src/features/StudyResults/helpers/applyIndexedMeasurementDisplay.js).
3. Persisted overrides remain raw values; indexed edits are converted back to raw before API save ([`useAiMeasurementsViewModel.js`](../../frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js#L289)).

## API Integration Pattern

Pattern used across feature queries:

1. Queue control plane and observer reads are split:
1. mutations via `PipelineApi` (`start`, `promote`, `cancel`, `regenerate-combined`)
2. queries via `pipeline/status` + AI result APIs
2. Query hook `select` maps to normalized readiness fields.
3. `refetchInterval` polls while pending.

Examples:

1. [`usePipelineStatusQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/usePipelineStatusQuery.js)
1. [`usePanechoEchoprimeResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/usePanechoEchoprimeResultsQuery.js#L9)
2. [`useDynamicMeasurementsResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/useDynamicMeasurementsResultsQuery.js#L9)
3. [`useLlmReportResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/useLlmReportResultsQuery.js#L9)

## Common Tasks (Frontend Recipes)

### Persist a StudyResults Measurement Override

Goal:

1. Persist doctor edit to backend and refresh UI.

Use:

1. [`useAiMeasurementsViewModel.js`](../../frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js) edit handlers:
1. `onStartEdit(item)` in [`useAiMeasurementsViewModel.js`](../../frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js#L247)
2. `onChangeValue(key, value)` or `onChangeLabel(key, label)` in [`useAiMeasurementsViewModel.js`](../../frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js#L264)
3. `onStopEdit(key)` to persist ([`useAiMeasurementsViewModel.js`](../../frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js#L275))
2. Internal persistence call:
1. `updatePanechoEchoprimeOverrides(studyUid, { [key]: payload })` in [`PanechoEchoprimeResultsApi.js`](../../frontend/src/api/results/PanechoEchoprimeResultsApi.js#L25)

Returns:

1. Updated combined payload is fetched on `refresh()`.

Caveats:

1. Invalid draft values set `fieldErrors` and block save.
2. In indexed mode, numeric input is converted back to raw before persistence.

### Fetch Metadata Required for Indexed Display

Goal:

1. Load sex/biometrics for indexed/raw display decisions.

Use:

1. [`useStudyMetaQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/useStudyMetaQuery.js#L9)
2. Consume from [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js):
1. `patientSex` in [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js#L172)
2. `patientHeightCm` in [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js#L173)
3. `patientWeightKg` in [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js#L174)
4. `heartRateBpm` in [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js#L175)

Returns:

1. Normalized values ready for viewmodel composition.

Caveats:

1. Missing height/weight disables indexed mode path.

### Drive StudyResults Polling and Readiness

Goal:

1. Present unified page readiness while multiple orchestrations run.

Use:

1. [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js#L275) for aggregated page state and per-query states.
2. [`useStudyResults.js`](../../frontend/src/features/StudyResults/hooks/useStudyResults.js#L176) for composed ViewModel output.

Returns:

1. Stable page-level state contract for layout and loading UX.

Caveats:

1. LLM state is conditionally enabled by `REACT_APP_ENABLE_LLM` ([`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js#L10)).

## Testing Hooks and ViewModels

Current frontend test layout (hybrid):

1. Integration tests in [`frontend/src/__tests__/integration/`](../../frontend/src/__tests__/integration/).
2. Feature tests co-located near source under [`frontend/src/features/`](../../frontend/src/features/).

StudyResults-focused tests:

1. [`useStudyResultsData.test.js`](../../frontend/src/features/StudyResults/hooks/__tests__/useStudyResultsData.test.js)
2. [`useAiMeasurementsViewModel.test.js`](../../frontend/src/features/StudyResults/hooks/__tests__/useAiMeasurementsViewModel.test.js)
3. [`useLlmReportViewModel.test.js`](../../frontend/src/features/StudyResults/hooks/__tests__/useLlmReportViewModel.test.js)
4. [`MainFileAiVideoMeasurements.test.js`](../../frontend/src/features/StudyResults/components/AiVideoMeasurements/__tests__/MainFileAiVideoMeasurements.test.js)
5. [`MainFileLlmReport.test.js`](../../frontend/src/features/StudyResults/components/LlmReport/__tests__/MainFileLlmReport.test.js)

Run from repo root:

```powershell
npm run test:frontend
```

## Known Frontend Risks

1. Hard-coded color classes can regress theme readability if they bypass semantic tokens.
2. Viewer modernization is high-risk for performance and should stay behind phased rollout.
3. Over-expanding view components with business logic breaks MVVM boundaries and complicates testing.
