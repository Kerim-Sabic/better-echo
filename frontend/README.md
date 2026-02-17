# Frontend Guide

This folder contains the React UI used by the Electron shell.

For full stack setup, use root [`README.md`](../README.md).

## Frontend Commands

Run from `frontend/`:

```bash
npm start
npm test
npm run build
```

Notes:

1. `npm start` runs CRA dev server on `http://localhost:3000`.
2. Root scripts set `BROWSER=none` and launch Electron separately.
3. LLM toggle for UI behavior is controlled by `REACT_APP_ENABLE_LLM`.
4. Deterministic single-run tests: `npm test -- --watchAll=false` (or use root `npm run test:frontend`).

## Environment Variables

Use `frontend/.env` (local, untracked) and copy initial values from [`frontend/.env.example`](./.env.example):

```env
REACT_APP_API_URL=http://localhost:8000/api
REACT_APP_API_URL_UPLOADS=http://localhost:8000/uploads
REACT_APP_VIEWER_URL=http://localhost:8042/stone-webviewer/index.html
```

## Frontend Structure (High-Level)

`src/` primary areas:

1. [`pages/`](./src/pages/) route pages (`Login`, `Dashboard`, `NewStudy`, `StudyResults`).
2. [`features/`](./src/features/) domain modules (Dashboard, StudyResults, NewStudy).
3. [`components/`](./src/components/) shared UI and shell components.
4. [`contexts/`](./src/contexts/) auth and route protection.
5. [`api/`](./src/api/) HTTP client modules.
6. [`lib/`](./src/lib/) utility helpers.
7. [`__tests__/integration/`](./src/__tests__/integration/) app-shell integration tests.
8. Feature tests co-located under [`features/**/__tests__/`](./src/features/).

## MVVM Usage in Frontend

The app uses an MVVM style in feature modules:

1. View components in `components/` and `layouts/`.
2. ViewModel hooks in `hooks/`.
3. Data/query hooks in nested `hooks/queries/`.
4. Pure helpers in `helpers/`.

Example:

1. [`useStudyResults.js`](./src/features/StudyResults/hooks/useStudyResults.js) composes feature state (`frontend/src/features/StudyResults/hooks/useStudyResults.js:39`).
2. [`StudyResultsLayout.jsx`](./src/features/StudyResults/layouts/StudyResultsLayout.jsx) renders tab/pane structure (`frontend/src/features/StudyResults/layouts/StudyResultsLayout.jsx:9`).
3. Measurement rendering and transformation live under StudyResults helpers/components.

## Where to Read Next

1. [`../README.md`](../README.md) for full stack setup.
2. [`../docs/HANDBOOK.md`](../docs/HANDBOOK.md) for architecture overview.
3. [`../docs/frontend/ARCHITECTURE.md`](../docs/frontend/ARCHITECTURE.md) for frontend deep dive.
