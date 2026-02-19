# Style Guide

Last Updated: 2026-02-16  
Owner: Engineering

Use this as the coding conventions reference for backend, frontend, and Electron.

## General

1. Keep changes surgical and readable.
2. Prefer clarity over clever abstractions.
3. Use module-level loggers in backend (no `print` debugging in committed code).
4. Keep comments sparse; use step-style comments/docstrings for main workflows only.
5. Default to ASCII unless a file already uses non-ASCII.

## Backend (FastAPI / Python)

1. Indentation: 4 spaces.
2. Routes/orchestration:
1. Keep short docstring with a `Steps:` summary for complex handlers.
2. Use clear phased inline comments for multi-step flows.
3. Add return types where useful, keep annotations practical.
4. Logging:
1. `logger = logging.getLogger(__name__)`
2. Info for state transitions, debug for noisy polling internals.
5. Respect env-driven knobs for preload, device, and batching.

## Frontend (React)

1. Indentation: 4 spaces.
2. Keep MVVM separation:
1. Views render.
2. ViewModel hooks compose behavior.
3. Query/data hooks isolate API state.
3. Prefer shared API client patterns over ad-hoc fetch logic.
4. Keep JSX explicit and easy to scan.

## Electron

1. Preserve split architecture:
1. `main.ts` lifecycle
2. `preload.ts` bridge
3. `ipc.ts` handlers
2. Keep IPC surface narrow and explicit.
3. Keep logs useful and concise.

## Documentation and Testing

1. If behavior/contracts/setup change, update docs in same PR.
2. Keep runbook and API notes synchronized with implementation changes.
3. Remove stale boilerplate docs and dead references when touched.

## File and Symbol Reference Standard

Use this standard in all canonical docs for implementation-critical references.

1. File reference (required clickable form):
1. ``[`main.ts`](../electron/main.ts)``
2. File reference with location hint (preferred for concrete logic):
1. ``[`main.ts`](../electron/main.ts#L60)``
3. Symbol reference with file and line hint:
1. `` `startBackend` in [`backend.ts`](../electron/backend.ts#L38) ``
4. Location hint format:
1. Use markdown line anchors in file links: `#L<number>`.
2. Keep the path repo-relative in the link.
3. Do not append trailing ``(`path:line`)`` hints.
5. Doc-to-doc links:
1. Use relative links with anchors, for example:
2. ``[API Groups](./API_SCHEMA_NOTES.md#api-groups-and-endpoints)``
