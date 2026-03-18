# Runbook

Last Updated: 2026-03-18  
Owner: Engineering

## Scope

Operational troubleshooting for local development and desktop runtime.

## Runtime Components

1. Docker PostgreSQL (`5433` -> container `5432`).
2. Docker Orthanc (`8042`, `4242`).
3. Docker OHIF viewer (`3001`).
4. FastAPI backend (`127.0.0.1:8000`).
5. React frontend (`localhost:3000` in dev).
6. Electron desktop runtime.
7. Optional LLM service managed by scripts/Electron.
8. Optional LAN dev mode (`0.0.0.0:8000` backend bind + LAN URL hint).

## Health Checks

1. Backend health:
1. `GET http://127.0.0.1:8000/api/health`
2. Route implementation: [`health_api.py`](../backend/app/api/health/health_api.py#L5)
2. Orthanc:
1. `GET http://localhost:8042`
3. Frontend (dev):
1. `http://localhost:3000`
4. Frontend (LAN dev):
1. `http://<your-lan-ip>:3000`

## LAN Device Cannot Connect

Symptoms:

1. App loads on host machine but not on another device in same network.
2. Login/API calls from second device fail or timeout.

Actions:

1. Start LAN stack instead of localhost-only stack:

```powershell
scripts\dev-lan.bat
```

or with LLM:

```powershell
scripts\dev-lan-with-llm.bat
```

2. Use the printed `LAN test URL` from startup logs.
3. Ensure backend logs show LAN hints and CORS allowlist at startup.
4. Verify both devices are on same network and not guest-isolated.
5. Verify Windows firewall allows inbound TCP on `3000`, `8000` (and `8042` if viewer access is needed).

## Startup Fails: Port Already In Use

Symptoms:

1. `scripts/dev-start.bat` or `scripts/dev-lan.bat` exits immediately.
2. Error indicates frontend `3000` or backend `8000` is already in use by another PID.

Actions:

1. Stop the conflicting process shown by the script output.
2. If PID-based stop is needed:

```powershell
Stop-Process -Id <PID> -Force
```

3. Rerun startup script:

```powershell
scripts\dev-start.bat
```

or:

```powershell
scripts\dev-lan.bat
```

## Docker Services Not Available

Symptoms:

1. DICOM upload/inference routes fail due to Orthanc connectivity.
2. Backend fails because PostgreSQL is not reachable.

Actions:

1. Start Docker Desktop.
2. Run:

```powershell
docker compose -f docker-compose.yml up -d postgres orthanc
docker compose -f viewer-ohif/docker-compose.yml up -d horalix-viewer
```

3. Validate `http://localhost:8042`.
4. Validate `docker ps --filter "name=horalix_postgres"`.
5. Startup helper reference: [`dev-start.ps1`](../scripts/dev-start.ps1).

## PostgreSQL Schema Bootstrap or Reset

Symptoms:

1. Backend fails because the local Postgres schema is missing or out of sync.
2. Fresh local DB starts but expected tables are not present.

Actions:

1. Ensure Docker Desktop is running.
2. Start local Postgres if needed:

```powershell
docker compose up -d postgres
```

3. From `backend/` run:

```powershell
python -m app.database.setup_db
```

4. Restart backend stack.

References:

1. Schema script: [`setup_db.py`](../backend/app/database/setup_db.py)
2. DB runtime config: [`config.py`](../backend/app/core/config.py)

Warning:

1. `python -m app.database.setup_db --drop` is destructive and should only be used for a local reset.

## PostgreSQL Connection or Missing Database

Symptoms:

1. Backend fails to connect to Postgres.
2. Tests fail because `horalix_test` does not exist.
3. Local startup fails because Docker Postgres is down.

Immediate unblock:

1. Ensure the Postgres container is running:

```powershell
docker compose up -d postgres
docker ps --filter "name=horalix_postgres"
```

2. If the main DB needs schema creation:

```powershell
cd backend
python -m app.database.setup_db
```

3. If the test DB is missing:

```powershell
docker exec horalix_postgres psql -U horalix -d postgres -c "CREATE DATABASE horalix_test;"
```

4. Re-run the backend tests or restart the backend.

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
3. Ensure Docker-backed services are healthy (`postgres`, `orthanc`, `horalix-viewer`).
4. Restart using `dev-start` or `dev-start-with-llm`.
5. Validate backend and Orthanc health endpoints.
