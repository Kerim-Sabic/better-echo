# Runbook

Last Updated: 2026-02-16  
Owner: Engineering

## Scope

Operational troubleshooting for local development and desktop runtime.

## Runtime Components

1. Docker Orthanc (`8042`, `4242`).
2. FastAPI backend (`127.0.0.1:8000`).
3. React frontend (`localhost:3000` in dev).
4. Electron desktop runtime.
5. Optional LLM service managed by scripts/Electron.

## Health Checks

1. Backend health:
1. `GET http://127.0.0.1:8000/api/health`
2. Route implementation: [`health_api.py`](../backend/app/api/health/health_api.py#L5)
2. Orthanc:
1. `GET http://localhost:8042`
3. Frontend (dev):
1. `http://localhost:3000`

## DockerOrthanc Not Available

Symptoms:

1. DICOM upload/inference routes fail due to Orthanc connectivity.

Actions:

1. Start Docker Desktop.
2. Run:

```powershell
docker compose -f docker-compose.yml up -d orthanc
```

3. Validate `http://localhost:8042`.
4. Startup helper reference: [`dev-start.ps1`](../scripts/dev-start.ps1).

## SQLite Schema Drift

Symptoms:

1. SQL errors like `no such column` after model changes.

Actions:

1. Stop services.
2. From `backend/` run:

```powershell
python -m app.database.setup_db
```

3. Restart stack.

References:

1. Schema script: [`setup_db.py`](../backend/app/database/setup_db.py)
2. Model field source for biometric columns: [`studies.py`](../backend/app/database_models/studies.py#L16)

Warning:

1. Local dev DB reset is destructive.

## LLM StartupShutdown Problems

Symptoms:

1. LLM report remains pending.
2. Port/process conflict for local LLM service.

Actions:

1. Stop stale service:

```powershell
scripts\stop_llm.ps1
```

2. Restart with LLM startup script:

```powershell
scripts\dev-start-with-llm.bat
```

References:

1. LLM start/stop wrappers: [`start_llm.ps1`](../scripts/start_llm.ps1), [`stop_llm.ps1`](../scripts/stop_llm.ps1)
2. Electron LLM lifecycle: [`llm.ts`](../electron/llm.ts#L44)
3. NPM dev entrypoint with LLM enabled: [`package.json`](../package.json#L12)

## Frontend Test Runtime Mismatches

Symptoms:

1. JSDOM media API errors.
2. Inconsistent local vs CI test outcomes.

Actions:

1. Ensure [`setupTests.js`](../frontend/src/setupTests.js) contains required media stubs ([`setupTests.js`](../frontend/src/setupTests.js#L37)).
2. Run deterministic mode:

```powershell
$env:CI='true'
cd frontend
npm test
```

## Electron Starts But Backend Fails

Symptoms:

1. Desktop window opens but API requests fail.

Actions:

1. Rebuild Electron main process:

```powershell
npm run build:electron
```

2. Restart with startup script.
3. Validate `/api/health`.

References:

1. Build script: [`package.json`](../package.json#L19)
2. Backend launch in Electron runtime: [`main.ts`](../electron/main.ts#L67)
3. Backend spawn implementation: [`backend.ts`](../electron/backend.ts#L38)

## Logs and Diagnostics

Backend logs:

1. [`horalix.log`](../backend/app/logs/horalix.log)

Useful debugging outputs:

1. Electron main-process console.
2. Frontend DevTools console/network.

## Safe Recovery Sequence

1. Stop app and all helper scripts.
2. Stop LLM service (`scripts\stop_llm.ps1`).
3. Ensure Docker + Orthanc are healthy.
4. Restart using `dev-start` or `dev-start-with-llm`.
5. Validate backend and Orthanc health endpoints.
