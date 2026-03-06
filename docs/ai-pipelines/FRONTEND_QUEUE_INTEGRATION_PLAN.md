# Frontend Queue Integration Plan (Pipeline-First Orchestration)

Last Updated: 2026-03-06  
Owner: Frontend + Backend Integration

## Scope

This is the frontend companion plan to the backend queue redesign.

In scope:

1. Wire NewStudy and StudyResults to backend pipeline endpoints.
2. Move frontend orchestration control from legacy result polling to explicit queue actions (`start`, `status`, `promote`, `cancel`, `regenerate-combined`).
3. Keep legacy result endpoints as observer-only data sources during transition.
4. Keep flow compatible with current frontend and future OHIF/Horalix Viewer refactor.

Out of scope:

1. Deep viewer overlay implementation details (depends on colleague OHIF branch).
2. Full frontend architecture cleanup/refactor not required for pilot.
3. Backend schema/model redesign (already handled in backend plan).

Source backend plan:

1. [`BACKEND_QUEUE_REWORK_PLAN.md`](./BACKEND_QUEUE_REWORK_PLAN.md)

## Why Keep a Single Big Plan File

Yes, this is the right approach for this phase.

Benefits:

1. End-to-end visibility in one place (current state, target state, exact files, tests, rollout).
2. Faster design decisions because dependencies are explicit before coding.
3. Better coordination between two developers working on backend/frontend in parallel.
4. Lower merge risk because planned touchpoints are mapped file-by-file.

## Current Frontend Behavior (Code Reality)

### NewStudy flow today

1. Uploads files one-by-one through `/upload-dicom`:
   1. [`useNewStudy.jsx`](../../frontend/src/features/NewStudy/hooks/useNewStudy.jsx)
   2. [`UploadDicomApi.js`](../../frontend/src/api/UploadDicomApi.js)
2. Tracks uploaded SOP Instance UIDs in local state.
3. After upload batch success, calls `pipeline/start`.
4. `Continue to Results` calls `pipeline/promote` and accepts:
   1. `200` (promoted now)
   2. `202` (promote intent accepted, backend auto-promotes later)
5. `Cancel` calls backend `pipeline/cancel` with confirmation copy that differs by new-study vs existing-study context.

### StudyResults flow today

1. Polls `pipeline/status` as orchestration truth.
2. Polls legacy result endpoints as observer-only payload reads:
   1. [`usePanechoEchoprimeResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/usePanechoEchoprimeResultsQuery.js)
   2. [`useDynamicMeasurementsResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/useDynamicMeasurementsResultsQuery.js)
   3. [`useLlmReportResultsQuery.js`](../../frontend/src/features/StudyResults/hooks/queries/useLlmReportResultsQuery.js)
3. Aggregates queue status + result reads into a page state machine:
   1. [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js)
4. Uses queue-native regenerate action (`pipeline/regenerate-combined`).
5. Keeps cancelled state neutral in clinician-facing status UX.

### API layer today

1. Observer result APIs exist:
   1. [`PanechoEchoprimeResultsApi.js`](../../frontend/src/api/orchestration_apis/PanechoEchoprimeResultsApi.js)
   2. [`DynamicMeasurementsResultsApi.js`](../../frontend/src/api/orchestration_apis/DynamicMeasurementsResultsApi.js)
   3. [`LlmReportResultsApi.js`](../../frontend/src/api/orchestration_apis/LlmReportResultsApi.js)
2. `PipelineApi` wrapper exists for start/status/promote/cancel/regenerate.

## Target Frontend Architecture (Plain English)

### Plain-English flow

1. Doctor uploads files on NewStudy.
2. After upload batch succeeds, frontend calls `pipeline/start` once.
3. Backend starts queue job immediately (doctor does not need to enter StudyResults for processing to begin).
4. Doctor can:
   1. Continue to StudyResults: frontend promotes draft artifacts, then navigates.
   2. Cancel: frontend calls `pipeline/cancel`; backend cleans up based on scope.
5. StudyResults becomes observer-only:
   1. Poll `pipeline/status` for stage progress.
   2. Fetch result payloads from legacy read endpoints.
6. Regenerate combined becomes explicit queue mutation (`pipeline/regenerate-combined`).

### Control split

1. Mutations (actions): `start`, `promote`, `cancel`, `regenerate-combined`.
2. Queries (observer-only): `pipeline/status` plus existing result queries.
3. Result endpoints remain read-only observers, not stage triggers.

## Backend Contract Used by Frontend

Pipeline endpoints:

1. `POST /api/studies/{study_uid}/pipeline/start`
2. `GET /api/studies/{study_uid}/pipeline/status`
3. `POST /api/studies/{study_uid}/pipeline/promote`
4. `POST /api/studies/{study_uid}/pipeline/cancel`
5. `POST /api/studies/{study_uid}/pipeline/regenerate-combined`

Request/response schemas:

1. [`pipeline_start_schemas.py`](../../backend/app/schemas/orchestration_apis/pipeline/pipeline_start_schemas.py)
2. [`pipeline_status_schemas.py`](../../backend/app/schemas/orchestration_apis/pipeline/pipeline_status_schemas.py)
3. [`pipeline_promote_schemas.py`](../../backend/app/schemas/orchestration_apis/pipeline/pipeline_promote_schemas.py)
4. [`pipeline_cancel_schemas.py`](../../backend/app/schemas/orchestration_apis/pipeline/pipeline_cancel_schemas.py)
5. [`pipeline_regenerate_schemas.py`](../../backend/app/schemas/orchestration_apis/pipeline/pipeline_regenerate_schemas.py)

Start payload fields required for frontend decisions:

1. `run_mode`: `upload_preview`, `append_preview`, `regenerate_combined`
2. `cleanup_scope`: `none`, `new_study`, `append_delta`
3. `uploaded_instance_uids`: SOP list from current upload batch

## Planned Frontend File Tree (Canonical)

```text
frontend/src/
|- api/
|  |- orchestration_apis/
|  |  |- PipelineApi.js                         (new)
|  |  |- PanechoEchoprimeResultsApi.js          (keep, observer-only)
|  |  |- DynamicMeasurementsResultsApi.js       (keep, observer-only)
|  |  `- LlmReportResultsApi.js                 (keep, observer-only)
|  `- UploadDicomApi.js                         (existing)
|- features/
|  |- NewStudy/
|  |  |- hooks/
|  |  |  `- useNewStudy.jsx                     (update: start/cancel/promote wiring)
|  |  `- NewStudyHeader.jsx                     (optional status UX updates)
|  `- StudyResults/
|     |- hooks/
|     |  |- useStudyResultsData.js              (update: status-first observer model)
|     |  |- queries/
|     |  |  |- usePipelineStatusQuery.js        (new)
|     |  |  |- usePanechoEchoprimeResultsQuery.js
|     |  |  |- useDynamicMeasurementsResultsQuery.js
|     |  |  `- useLlmReportResultsQuery.js
|     |  `- mutations/
|     |     |- usePipelinePromoteMutation.js    (new)
|     |     |- usePipelineCancelMutation.js     (new)
|     |     `- usePipelineRegenerateMutation.js (new)
|     `- components/
|        `- ...                                 (status/progress UI updates as needed)
`- pages/
   |- NewStudy.jsx                              (update: cancel flow and button states)
   `- StudyResults.jsx                          (minor integration if needed)
```

## File-by-File Checklist (Frontend)

### A) API Layer

1. Add `frontend/src/api/orchestration_apis/PipelineApi.js` with:
   1. `startStudyPipeline`
   2. `getStudyPipelineStatus`
   3. `promoteStudyPipelineDraft`
   4. `cancelStudyPipeline`
   5. `regenerateStudyPipelineCombined`
2. Keep observer API files as read-only wrappers (no queue side effects).
3. Reuse `apiClient` and `parseRetryAfter` from [`client.js`](../../frontend/src/api/shared/client.js).

### B) NewStudy Upload + Queue Start

1. Update [`useNewStudy.jsx`](../../frontend/src/features/NewStudy/hooks/useNewStudy.jsx):
   1. After upload batch success, call `pipeline/start` once.
   2. Pass `uploaded_instance_uids` collected from upload responses.
   3. Determine and pass `run_mode`/`cleanup_scope` for new vs append flow.
   4. Store queue metadata in state (`jobId`, `pipelineStatus`, `cleanupScope`).
2. Update [`NewStudy.jsx`](../../frontend/src/pages/NewStudy.jsx):
   1. `Cancel` triggers backend cancel (if a queue job exists), then navigate.
   2. Disable conflicting actions while cancel/promote/start mutation is in flight.
3. Keep `Continue to Results` behavior:
   1. Promote draft to active before navigation.
   2. If promote returns 409 (no promotable draft yet), keep user in flow with actionable status.

### C) StudyResults Status-First Observer Model

1. Add `usePipelineStatusQuery` with polling based on pipeline state.
2. Update [`useStudyResultsData.js`](../../frontend/src/features/StudyResults/hooks/useStudyResultsData.js):
   1. Use pipeline status as primary orchestration state.
   2. Keep result queries for payload retrieval only.
   3. Derive page-level state from queue status + stage snapshots + result availability.
3. Keep legacy result queries but explicitly as observer-only readers.

### D) StudyResults Actions

1. Add mutation hook: `usePipelineRegenerateMutation` and wire regenerate UI action.
2. Add mutation hook: `usePipelineCancelMutation` for explicit user cancel actions where needed.
3. Add mutation hook: `usePipelinePromoteMutation` if StudyResults needs explicit promote actions beyond NewStudy handoff.
4. Keep existing override patch flow unchanged in this phase:
   1. [`updatePanechoEchoprimeOverrides`](../../frontend/src/api/orchestration_apis/PanechoEchoprimeResultsApi.js)

### E) Query Keys and Invalidation

1. Introduce canonical query keys:
   1. `["pipelineStatus", studyUid]`
   2. `["combinedResults", studyUid]`
   3. `["dynamicMeasurementsResults", studyUid]`
   4. `["llmReportResults", studyUid]`
2. On mutations, invalidate only affected keys.
3. Avoid full app-wide invalidation to keep UI responsive.

### F) Tests

1. Add API wrapper tests for pipeline endpoints.
2. Add hook tests for:
   1. NewStudy queue start flow
   2. NewStudy cancel flow
   3. Promote-before-navigate behavior
   4. StudyResults status derivation from pipeline states
3. Keep existing StudyResults query tests and update expectations for status-first orchestration.

### G) Documentation

1. Update [`ORCHESTRATION.md`](./ORCHESTRATION.md) when frontend wiring lands.
2. Update [`docs/frontend/ARCHITECTURE.md`](../frontend/ARCHITECTURE.md) with pipeline action/query boundaries.
3. Update [`CURRENT_TASKS.md`](../CURRENT_TASKS.md) status checkpoints.

## Iteration Plan (Small, Merge-Safe Steps)

### Iteration F1: API Foundation

1. Add `PipelineApi.js`.
2. Add query key constants (if needed).
3. Add unit tests for API wrappers.

Acceptance:

1. Frontend can call all five pipeline endpoints via typed wrappers.

### Iteration F2: NewStudy Queue Start

1. Wire `pipeline/start` after upload batch success.
2. Persist returned `job_id` and startup status in NewStudy state.

Acceptance:

1. Uploading starts backend pipeline without entering StudyResults.

### Iteration F3: NewStudy Cancel Semantics

1. Wire `Cancel` to `pipeline/cancel`.
2. Keep safe behavior when no queue job exists.

Acceptance:

1. Cancel triggers backend queue cancellation/cleanup path and does not only navigate.

### Iteration F4: Promote on Continue

1. Wire `Continue to Results` to `pipeline/promote` then navigate.
2. Treat `200` (promoted now) and `202` (promote intent accepted) as navigable success paths.
3. Handle `409` conflicts safely (show status and stay on NewStudy).

Acceptance:

1. Continue action is durable and not blocked by slow in-flight queue completion.
2. Backend owns delayed auto-promotion after `202` intent acceptance.

### Iteration F5: StudyResults Status Query

1. Add `usePipelineStatusQuery`.
2. Integrate into `useStudyResultsData` as primary orchestration signal.

Acceptance:

1. StudyResults progression no longer depends on legacy endpoint polling semantics.

### Iteration F6: Regenerate Combined Action

1. Add regenerate mutation using `pipeline/regenerate-combined`.
2. Refresh status + result queries on mutation success.

Acceptance:

1. Regenerate is queue-native and consistent with draft/active model.

### Iteration F7: UI Polish + Failure States

1. Improve pending/failed/cancelled messaging from pipeline status.
2. Add retry affordances for recoverable states.

Acceptance:

1. Clinician sees clear queue state and actionable next steps.

### Iteration F8: Frontend Legacy Cleanup (Post-Viewer Merge)

1. Remove frontend assumptions that legacy result endpoints trigger backend work.
2. Remove temporary compatibility code introduced during migration.

Acceptance:

1. Frontend orchestration path is action-driven, observer-only for reads, and minimal.

## Implementation Status (Current Branch)

1. Iteration F1 is implemented (`PipelineApi` + API tests).
2. Iteration F2 is implemented (NewStudy starts pipeline after upload batch).
3. Iteration F3 is implemented (NewStudy cancel is backend-aware).
4. Iteration F4 is implemented (`Continue` uses promote with `200`/`202` success handling).
5. Iteration F5 is implemented (StudyResults pipeline status query + status-first orchestration).
6. Iteration F6 is implemented (queue-native regenerate combined action in StudyResults).
7. Iteration F7 is implemented (status messaging polish + context-aware NewStudy cancel confirmations).

## Validation Matrix

### Functional

1. Upload on NewStudy triggers one queue job.
2. Queue keeps running if user leaves StudyResults or app window focus changes.
3. Continue to Results promotes draft to active before showing final active results.
4. Cancel from NewStudy performs backend cancel semantics.
5. Regenerate combined refreshes AI raw values while keeping overrides.

### Multi-user

1. Two doctors upload at same time and receive only their own study/job states.
2. One doctor cancel does not impact another doctor study/job.

### Error handling

1. Start endpoint failure surfaces clear error in NewStudy.
2. Promote outcomes are explicit:
   1. `200` navigate
   2. `202` navigate (backend auto-promotes later)
   3. `409` stay and show guidance
3. Cancel on non-cancellable state shows backend message cleanly.

### UX

1. No hidden background triggers from result queries.
2. Status text always matches backend pipeline status.

## Rollout Strategy (Pilot-Safe)

1. Implement frontend changes in small iterations with test checkpoints.
2. Keep observer result APIs intact during migration.
3. Do not remove compatibility paths until:
   1. backend queue flow is stable in pilot branch
   2. OHIF viewer merge branch is integrated and validated
4. Final cleanup pass removes temporary migration code and updates docs to architecture truth docs.

## Frontend Merge Strategy with OHIF Branch

1. Keep queue API wrappers and queue hooks independent from viewer rendering code.
2. Minimize coupling by keeping orchestration state logic in hooks, not in viewer components.
3. Integrate OHIF branch by adapting only:
   1. action wiring (`start`, `promote`, `cancel`, `regenerate`)
   2. result/overlay consumers
4. Treat queue status contract as stable backend boundary to reduce merge conflicts.

## Branch Carry-Forward Caveat

When integrating into `pilot-new-frontend`, do not wire Continue flow before carrying backend promote-intent contract changes.

Frontend files that depend on this:

1. `frontend/src/features/NewStudy/hooks/useNewStudy.jsx`
2. `frontend/src/pages/NewStudy.jsx`
3. `frontend/src/features/NewStudy/hooks/__tests__/useNewStudy.test.js`
4. `frontend/src/api/orchestration_apis/PipelineApi.js`
5. `frontend/src/api/orchestration_apis/__tests__/PipelineApi.test.js`

## Completion Criteria

1. NewStudy starts pipeline immediately after upload batch.
2. NewStudy cancel is backend-aware and not navigation-only.
3. Continue flow promotes draft to active explicitly.
4. StudyResults uses pipeline status as orchestration truth.
5. Regenerate combined is queue-native.
6. Frontend behavior is stable on old UI and adaptable to OHIF viewer branch.
