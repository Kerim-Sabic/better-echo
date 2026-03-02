# Current Tasks

Last Updated: 2026-03-02  
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
    9. Canonical implementation plan: [`BACKEND_QUEUE_REWORK_PLAN.md`](./ai-pipelines/BACKEND_QUEUE_REWORK_PLAN.md).
4. Dashboard completion status hardening
    1. Ensure completion reflects all required orchestration outputs, not single-model completion.
5. Approve/Sign and Send to PACS workflow wiring
    1. Finalize API and UX flow for action buttons in StudyResults.
6. Documentation program execution
    1. Keep handbook/runbook/api docs in sync with upcoming viewer and orchestration changes.

## Active Blueprint: Backend Orchestration Queue Redesign (Locked)

Source of truth:

1. [`BACKEND_QUEUE_REWORK_PLAN.md`](./ai-pipelines/BACKEND_QUEUE_REWORK_PLAN.md)

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

## Planned Queue

1. CSP hardening for Electron renderer.
2. Continued inference performance tuning and batching safeguards.
3. AI segmentation instance-to-viewer mapping refinements.
4. Authentication/WebAuthn security hardening (parked until after pilot):
    1. Secure cookie policy for production (`Secure`, `SameSite`, HTTPS assumptions).
    2. Final CORS/origin restrictions for hospital deployment.
5. Python deprecation cleanup pass (parked until after pilot):
    1. Replace deprecated `datetime.utcnow()` usage with timezone-aware UTC.
    2. Replace Pydantic class-based config / `from_orm` legacy patterns with V2-native usage.

## Recently Completed (High Level)

1. Indexed/raw measurement mode support in StudyResults.
2. Sex-aware threshold range logic in measurements rendering.
3. LLM payload enrichment and deterministic report generation controls.
4. Dark mode and style system normalization work.

## Documentation Maintenance Checklist

For every behavior or contract change:

1. Update [`README.md`](../README.md) if setup/run behavior changes.
2. Update [`API_SCHEMA_NOTES.md`](./API_SCHEMA_NOTES.md) for request/response or schema changes.
3. Update relevant subsystem architecture doc in [`docs/backend/ARCHITECTURE.md`](./backend/ARCHITECTURE.md), [`docs/frontend/ARCHITECTURE.md`](./frontend/ARCHITECTURE.md), [`docs/electron/ARCHITECTURE.md`](./electron/ARCHITECTURE.md), or [`docs/ai-pipelines/ORCHESTRATION.md`](./ai-pipelines/ORCHESTRATION.md).
4. Update runbook if troubleshooting guidance changed.
5. Update this task board status.
