# Current Tasks

Last Updated: 2026-02-16  
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
2. Dashboard completion status hardening
1. Ensure completion reflects all required orchestration outputs, not single-model completion.
3. Approve/Sign and Send to PACS workflow wiring
1. Finalize API and UX flow for action buttons in StudyResults.
4. Documentation program execution
1. Keep handbook/runbook/api docs in sync with upcoming viewer and orchestration changes.

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
