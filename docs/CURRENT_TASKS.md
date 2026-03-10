# Current Tasks

Last Updated: 2026-03-11  
Owner: Engineering

## How to Use This File

1. Keep this as the active planning board.
2. Move completed items to the completed section.
3. Keep task text decision-ready so implementation can start without re-analysis.

## Active Queue

1. WebAuthn pilot reliability pass (P0 for hospital pilot)
    1. Implemented this cycle:
    1. WebAuthn routes now use `/api/webauthn/*` with dedicated Swagger `WebAuthn` group.
    2. Backend startup now enforces single-process mode when `WEBAUTHN_STATE_BACKEND=memory` and `WEBAUTHN_REQUIRE_SINGLE_PROCESS=true`.
    3. OpenAPI route contract and grouping checks are covered by backend integration tests.
    1. Manual smoke validation on current build:
    1. Registration start -> complete via Dashboard enroll flow.
    2. Authentication start -> complete via Login biometric flow.
    3. Credential delete flow from Dashboard.
    4. Verify Swagger grouping now shows WebAuthn as a separate group and routes under `/api/webauthn/*`.
    2. Multi-user/multi-worker ceremony-state decision:
    1. If pilot runs single backend process: keep in-memory ceremony state and document startup contract.
    2. If pilot runs multi-worker or multiple backend instances: move pending WebAuthn ceremony state to shared storage (Redis) and keep behavior parity.
    3. Add regression checks:
    1. Keep OpenAPI route contract test for `/api/webauthn/*`.
    2. Add one integration test covering successful start->complete ceremony sequence.
    4. Deliverables for this pass:
    1. Pilot runbook snippet with exact smoke-test steps and expected outcomes.
    2. Clear deployment note in docs specifying single-worker vs shared-state requirements.
    3. Pilot checklist: [`WEBAUTHN_PILOT_SMOKE_CHECKLIST.md`](./ops/WEBAUTHN_PILOT_SMOKE_CHECKLIST.md).
2. StudyResults viewer modernization
    1. Replace iframe-based viewer path with first-class in-app viewer architecture.
    2. Keep MVVM boundaries and avoid monolithic page imports.
    3. Use phased rollout with fallback path.
    4. Track performance acceptance targets before default enable.
3. Backend orchestration queue redesign (server-first, multi-user safe)
    1. Move stage progression from frontend polling triggers to backend-owned pipeline chaining.
    2. Add idempotent queue start flow and per-study sequencing guarantees.
    3. Preserve partial result visibility while pipeline continues in background.
    4. Defer frontend integration changes until viewer branch stabilizes to avoid merge churn.
    5. Add a backend pre-filter stage before model execution (hard DICOM compatibility checks first).
    6. Use a single view-confidence gate of `>=0.75` for classifier-routed instances.
    7. If DICOM tags identify spectral Doppler upfront, skip view-classifier work for that instance and route directly to the Doppler lane.
    8. Persist explicit skip reason codes for filtered instances to keep orchestration transparent and debuggable.
    9. Canonical backend implementation plan: [`BACKEND_QUEUE_REWORK_PLAN.md`](./ai-pipelines/BACKEND_QUEUE_REWORK_PLAN.md).
    10. Canonical frontend integration companion plan: [`FRONTEND_QUEUE_INTEGRATION_PLAN.md`](./ai-pipelines/FRONTEND_QUEUE_INTEGRATION_PLAN.md).
4. Dashboard completion status hardening
    1. Ensure completion reflects all required orchestration outputs, not single-model completion.
5. Approve/Sign and Send to PACS workflow wiring
    1. Finalize API and UX flow for action buttons in StudyResults.
6. Documentation program execution
    1. Keep handbook/runbook/api docs in sync with upcoming viewer and orchestration changes.

## Active Blueprint: Backend Orchestration Queue Redesign (Locked)

Source of truth:

1. [`BACKEND_QUEUE_REWORK_PLAN.md`](./ai-pipelines/BACKEND_QUEUE_REWORK_PLAN.md)
2. [`FRONTEND_QUEUE_INTEGRATION_PLAN.md`](./ai-pipelines/FRONTEND_QUEUE_INTEGRATION_PLAN.md)

Locked highlights:

1. Backend owns stage progression end-to-end after one idempotent queue start call.
2. Queue kickoff happens after upload batch completion (not per-file upload) to avoid incomplete-study processing.
3. Global view-confidence gate stays `>=0.75` with hard compatibility checks first.
4. Spectral Doppler tag short-circuit is required.
5. Skip reasons are persisted and auditable.
6. LLM-enabled and LLM-disabled completion rules stay environment-aware.
7. Any required stage failure propagates study status to `failed`.
8. Low-VRAM vs server behavior is controlled via `.env` profile/unload variables and documented comments in `backend/.env.example`.
9. Upload-phase processing writes to draft artifacts and only becomes active after explicit promote action.
10. Regenerate combined updates raw AI values while preserving clinician overrides.
11. Use the iteration ladder in [`BACKEND_QUEUE_REWORK_PLAN.md`](./ai-pipelines/BACKEND_QUEUE_REWORK_PLAN.md#iteration-plan-small-manageable-steps) for small, focused implementation steps.
12. Use the legacy trim list in [`BACKEND_QUEUE_REWORK_PLAN.md`](./ai-pipelines/BACKEND_QUEUE_REWORK_PLAN.md#legacy-cleanup-register-trim-at-end) during implementation and remove all temporary fallback paths before release.
13. Combined-results compact-contract follow-up is tracked separately in [`COMBINED_RESULTS_COMPACT_CONTRACT_PLAN.md`](./ai-pipelines/COMBINED_RESULTS_COMPACT_CONTRACT_PLAN.md).

Current implementation status:

1. Iteration 1 (Queue foundation and read-only observability) is implemented on backend:
1. Queue tables + service + scheduler skeleton.
2. `pipeline/start` and `pipeline/status` routes.
3. Backend tests for idempotent enqueue and status snapshots.
2. Iteration 2 (Draft artifact boundary) is implemented on backend:
1. `pipeline_artifact_sets` table and model wiring.
2. `derived_results.artifact_set_id` linkage added.
3. Queue start creates per-job `draft` set and backfills study-level legacy artifacts to `active` set.
4. Pipeline status now includes `artifact_sets.draft` and `artifact_sets.active`.
3. Iteration 3 (Promote and cancel semantics) is implemented on backend:
1. `pipeline/promote` route atomically swaps latest completed draft set to active.
2. `pipeline/cancel` route supports immediate cancel (queued/completed) and cooperative cancel request (running).
3. Cancel cleanup scopes are implemented (`none`, `append_delta`, `new_study`) via backend cleanup service.
4. Pipeline status now exposes cancellation fields (`cancel_requested_at`, `is_cancel_requested`).
4. Iteration 4 (Stage worker integration + routing gate) is implemented on backend:
1. Scheduler now executes real stage handlers (`prefilter`, `combined`, `dynamic_measurements`, optional `llm`) instead of stub payloads.
2. Queue prefilter uses hard compatibility + Doppler short-circuit + global confidence gate from config (`PIPELINE_VIEW_CONFIDENCE_MIN`, default `0.75`).
3. Combined stage supports filtered instance subsets and persists draft-scoped combined artifacts with override preservation.
4. Dynamic/measurements stage now persists draft-scoped `Dynamic_Measurements_Combined_Tasks` payloads for queue-generated runs.
5. Inference endpoints now support internal draft writes via `artifact_set_id` without breaking existing legacy route behavior.
5. Iteration 5 (Regenerate combined + override preservation) is implemented on backend:
1. `pipeline/regenerate-combined` endpoint added for explicit regenerate queue runs.
2. Regenerate mode now requires an active combined baseline (`409` when missing).
3. Regenerate success auto-promotes draft artifact set to active.
4. Regenerate failure keeps previous active artifact set unchanged.
5. Combined regenerate preserves clinician overrides while refreshing raw AI values.
6. Iteration 6 (Legacy trigger neutralization, backend side) is implemented on backend:
1. Legacy orchestration GET routes are observer-only and no longer enqueue/progress stages.
2. Legacy orchestration GET routes now prefer active artifact-set rows and fallback to legacy rows when needed.
3. Failure propagation now includes queue-stage failure fallback (`combined`, `dynamic_measurements`, `llm`) for clearer failed vs pending semantics.
4. Integration coverage was updated for observer-only behavior and active-over-draft read preference.
5. Canonical service imports now target `app.services.pipeline.*`.
7. Iteration 7 (shim trim + canonical path finalization) is implemented on backend:
1. Removed legacy top-level service shims (`pipeline_queue_service.py`, `pipeline_scheduler.py`, `pipeline_cleanup_service.py`, `orchestration_read_service.py`, `pipeline_stage_executor.py`).
2. Runtime/test/docs references now target canonical modules under `backend/app/services/pipeline/`.
3. Queue behavior/contracts remain unchanged; this is structure cleanup only.
8. Services canonicalization for integrations/reporting is implemented:
1. Canonical locations are now `backend/app/services/integrations/` (`llm_client.py`, `orthanc_client.py`) and `backend/app/services/reporting/` (`llm_report_service.py`).
2. Root service duplicates (`llm_client.py`, `orthanc_client.py`, `llm_report_service.py`) were removed.
3. Runtime imports and docs were updated to canonical paths.
9. Iteration 4 promote-intent contract is implemented (backend + frontend):
1. `pipeline/promote` now returns:
1. `200` when promoted immediately
2. `202` when promote intent is recorded (`auto_promote_on_complete`) and backend will auto-promote on completion
3. `409` only when no valid promote context exists
2. NewStudy Continue now supports `200` and `202` as navigable success paths.
10. Frontend queue integration status:
1. Iteration F5 is implemented:
1. StudyResults now consumes `pipeline/status` via `usePipelineStatusQuery`.
2. StudyResults page state is status-first with ready-over-pending precedence when active results are already complete.
2. Iteration F6 is implemented:
1. StudyResults now has queue-native combined regenerate action wired to `pipeline/regenerate-combined`.
2. Regenerate success refreshes status and observer result queries.
3. Regenerate `409` is handled as a controlled UI message (no crash path).
3. Iteration F7 is implemented:
1. StudyResults header now shows clearer pending/failed/ready status messaging and retry affordance for recoverable failures.
2. Cancelled pipeline state is treated as neutral and is not shown as a persistent user-facing status label.
3. NewStudy cancel flow now requires confirmation with context-specific copy for new-study upload vs existing-study update.
11. Pilot reliability stabilization pass is implemented (backend + operator startup path):
1. Study read routes (`GET /api/studies`, `GET /api/studies/{study_uid}`) no longer perform DB write-back during reads.
2. Study delete path is idempotent with Orthanc `404` treated as already-deleted success.
3. Ownership checks are enforced across study/patient/result observer APIs to prevent cross-user reads/writes.
4. SQLite engine/test config now applies busy timeout + WAL pragmas and uses longer connection timeout for lock resilience.
5. Pipeline cancel flow bug for new-study cleanup was fixed by preserving `job_id` before delete-cascade commit.
6. Dev startup scripts now fail fast when `3000` or `8000` are already occupied, with process/PID hints.

## Branch Carry-Forward Caveat (Do Not Miss)

When moving work to `pilot-new-frontend`, you must carry the promote-intent backend contract patch.  
Without this patch, frontend Continue behavior will diverge and can break expected auto-promotion flow.

Minimum backend files to carry:

1. `backend/app/database_models/pipeline_jobs.py`
2. `backend/app/services/pipeline/service.py`
3. `backend/app/services/pipeline/internal/runner.py`
4. `backend/app/api/pipeline/pipeline_promote_api.py`
5. `backend/app/schemas/pipeline/pipeline_promote_schemas.py`
6. `backend/tests/unit/test_pipeline_queue_service.py`
7. `backend/tests/integration/test_pipeline_queue_api.py`

Minimum frontend files that rely on this contract:

1. `frontend/src/features/NewStudy/hooks/useNewStudy.jsx`
2. `frontend/src/pages/NewStudy.jsx`
3. `frontend/src/features/NewStudy/hooks/__tests__/useNewStudy.test.js`
4. `frontend/src/api/pipeline/PipelineApi.js`

## Planned Queue

1. CSP hardening for Electron renderer.
2. Controlled multi-threaded/multi-worker queue execution for high-VRAM systems:
    1. Add backend-owned parallel job execution behind env flag(s) for server profile.
    2. Keep per-study ordering guarantees and cancellation semantics intact.
    3. Add GPU slot controls/semaphores to avoid VRAM overcommit.
    4. Add soak/perf validation for throughput vs latency before enabling by default.
3. Continued inference performance tuning and batching safeguards.
4. AI segmentation instance-to-viewer mapping refinements.
5. Authentication/WebAuthn security hardening (parked until after pilot):
    1. Secure cookie policy for production (`Secure`, `SameSite`, HTTPS assumptions).
    2. Final CORS/origin restrictions for hospital deployment.
6. Python deprecation cleanup pass (parked until after pilot):
    1. Replace deprecated `datetime.utcnow()` usage with timezone-aware UTC.
    2. Replace Pydantic class-based config / `from_orm` legacy patterns with V2-native usage.

## Recently Completed (High Level)

1. Indexed/raw measurement mode support in StudyResults.
2. Sex-aware threshold range logic in measurements rendering.
3. LLM payload enrichment and deterministic report generation controls.
4. Dark mode and style system normalization work.
5. Dynamic+Measurements observer payload normalization on backend:
    1. read contract is now typed and normalized
    2. stage payload internals are no longer passed through directly
    3. preview pending responses preserve partial normalized instance/media progress
6. StudyResults combined measurements frontend cutover:
    1. active UI now renders backend-owned `panecho_echoprime_results.display`
    2. local measurement-builder/range catalog files were removed from the active path
    3. indexed mode remains a thin client-side display transform only
7. Combined results compact-contract Iteration 1:
    1. added `edit_baselines`
    2. slimmed public `overrides` to `value` / `label`
    3. kept `integrated_tasks` temporarily for compatibility
    4. remaining work is tracked in [`COMBINED_RESULTS_COMPACT_CONTRACT_PLAN.md`](./ai-pipelines/COMBINED_RESULTS_COMPACT_CONTRACT_PLAN.md)

## Documentation Maintenance Checklist

For every behavior or contract change:

1. Update [`README.md`](../README.md) if setup/run behavior changes.
2. Update [`API_SCHEMA_NOTES.md`](./API_SCHEMA_NOTES.md) for request/response or schema changes.
3. Update relevant subsystem architecture doc in [`docs/backend/ARCHITECTURE.md`](./backend/ARCHITECTURE.md), [`docs/frontend/ARCHITECTURE.md`](./frontend/ARCHITECTURE.md), [`docs/electron/ARCHITECTURE.md`](./electron/ARCHITECTURE.md), or [`docs/ai-pipelines/ORCHESTRATION.md`](./ai-pipelines/ORCHESTRATION.md).
4. Update runbook if troubleshooting guidance changed.
5. Update this task board status.
