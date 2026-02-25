# Current Tasks

Last Updated: 2026-02-24  
Owner: Engineering

## How to Use This File

1. Keep this as the active planning board.
2. Move completed items to the completed section.
3. Keep task text decision-ready so implementation can start without re-analysis.

## Active Queue

1. StudyResults viewer modernization
    1. Replace iframe-based viewer path with first-class in-app viewer architecture.
    2. Keep MVVM boundaries and avoid monolithic page imports.
    3. Use phased rollout with fallback path.
    4. Track performance acceptance targets before default enable.
2. Backend orchestration queue redesign (server-first, multi-user safe)
    1. Move stage progression from frontend polling triggers to backend-owned pipeline chaining.
    2. Add idempotent queue start flow and per-study sequencing guarantees.
    3. Preserve partial result visibility while pipeline continues in background.
    4. Defer frontend integration changes until viewer branch stabilizes to avoid merge churn.
    5. Add a backend pre-filter stage before model execution (hard DICOM compatibility checks first).
    6. Use a single view-confidence gate of `>=0.75` for classifier-routed instances.
    7. If DICOM tags identify spectral Doppler upfront, skip view-classifier work for that instance and route directly to the Doppler lane.
    8. Persist explicit skip reason codes for filtered instances to keep orchestration transparent and debuggable.
    9. Canonical implementation plan: [`BACKEND_QUEUE_REWORK_PLAN.md`](./ai-pipelines/BACKEND_QUEUE_REWORK_PLAN.md).
3. Dashboard completion status hardening
    1. Ensure completion reflects all required orchestration outputs, not single-model completion.
4. Approve/Sign and Send to PACS workflow wiring
    1. Finalize API and UX flow for action buttons in StudyResults.
5. Documentation program execution
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

## Planned Queue

1. CSP hardening for Electron renderer.
2. Continued inference performance tuning and batching safeguards.
3. AI segmentation instance-to-viewer mapping refinements.

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
