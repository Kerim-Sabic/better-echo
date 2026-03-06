# Runbook

Last Updated: 2026-03-06  
Owner: Engineering

## Scope

Operational troubleshooting for local development and desktop runtime.

## Runtime Components

1. Docker Orthanc (`8042`, `4242`).
2. FastAPI backend (`127.0.0.1:8000`).
3. React frontend (`localhost:3000` in dev).
4. Electron desktop runtime.
5. Optional LLM service managed by scripts/Electron.
6. Optional LAN dev mode (`0.0.0.0:8000` backend bind + LAN URL hint).

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

## SQLite "database is locked"

Symptoms:

1. API requests fail with `sqlite3.OperationalError: database is locked`.
2. Dashboard requests may hang or return `500` while another process keeps a write lock.

Immediate unblock:

1. Stop all backend/electron/frontend dev processes.
2. Ensure no backend listener remains on `8000`.
3. Restart with one startup script only (`dev-start` or `dev-lan`), not multiple overlapping stacks.

If lock persists:

1. Backup and rebuild local DB:

```powershell
Copy-Item backend/database.db "backend/database.$(Get-Date -Format 'yyyyMMdd_HHmmss').bak"
Remove-Item backend/database.db -Force -ErrorAction SilentlyContinue
Remove-Item backend/database.db-wal -Force -ErrorAction SilentlyContinue
Remove-Item backend/database.db-shm -Force -ErrorAction SilentlyContinue
cd backend
python -m app.database.setup_db
python -m app.database.create_user
```

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
