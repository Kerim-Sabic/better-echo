# Runbook

Last Updated: 2026-04-06  
Owner: Engineering

## Scope

Operational troubleshooting for development mode and packaged desktop runtime.

## Runtime Components

Development stack:

1. Docker PostgreSQL on `localhost:5433`
2. Docker Orthanc on `localhost:8042`
3. Docker OHIF viewer on `localhost:3001`
4. FastAPI backend on `127.0.0.1:8000` or `0.0.0.0:8000`
5. React dev server on `localhost:3000`
6. Electron renderer window

Packaged server stack:

1. packaged Electron server runtime
2. packaged backend executable
3. Docker PostgreSQL, Orthanc, and OHIF viewer
4. optional local LLM runtime

Packaged client stack:

1. packaged Electron client runtime
2. saved remote backend base URL
3. saved remote viewer base URL

## Health Checks

1. Backend: `GET http://127.0.0.1:8000/api/health`
2. Orthanc: `GET http://localhost:8042`
3. Viewer: `http://localhost:3001`
4. Frontend dev server: `http://localhost:3000`

Implementation references:

1. [`health_api.py`](../backend/app/api/health/health_api.py)
2. [`backend.ts`](../electron/backend.ts)
3. [`infrastructure.ts`](../electron/infrastructure.ts)

## Development Startup

Without LLM:

```powershell
scripts\dev-start.bat
```

With LLM:

```powershell
scripts\dev-start-with-llm.bat
```

LAN mode without LLM:

```powershell
scripts\dev-lan.bat
```

LAN mode with LLM:

```powershell
scripts\dev-lan-with-llm.bat
```

PowerShell equivalents live in [`scripts/`](../scripts/).

## Packaged Server Startup

Packaged server mode requires:

1. Docker Desktop running
2. the packaged server resources extracted intact
3. a valid packaged backend `.env` under `resources/backend/.env`
4. WSL plus the configured LLM runtime only when `ENABLE_LLM=true`
5. vendor access credentials, when enabled, embedded at build time rather than stored in the shipped runtime `.env`

Preflight is enforced through:

1. [`preflight.ts`](../electron/preflight.ts)
2. [`server_preflight.ps1`](../scripts/server_preflight.ps1)

Packaged vendor access credentials are generated from:

1. [`backend/.env.example`](../backend/.env.example)
2. [`backend/desktop/generate_release_config.py`](../backend/desktop/generate_release_config.py)
3. [`backend/desktop/launcher.py`](../backend/desktop/launcher.py)

Build-time keys:

1. `HORALIX_RELEASE_VENDOR_ACCESS_ENABLED`
2. `HORALIX_RELEASE_VENDOR_ACCESS_USERNAME`
3. `HORALIX_RELEASE_VENDOR_ACCESS_DISPLAY_NAME`
4. `HORALIX_RELEASE_VENDOR_ACCESS_PASSWORD_HASH`

## Client Runtime Configuration

Client runtime configuration is stored in Electron `userData` as `runtime-config.json` by [`ipc.ts`](../electron/ipc.ts).

The renderer setup flow is owned by:

1. [`RuntimeConfigGate.jsx`](../frontend/src/general_components/RuntimeConfigGate.jsx)
2. [`useElectronRuntimeConfig.js`](../frontend/src/hooks/useElectronRuntimeConfig.js)

## Logs and Paths

Source mode:

1. backend logs: `backend/app/logs/horalix.log`

Packaged server mode:

1. logs live under the packaged server cache root resolved by [`runtime_paths.py`](../backend/app/core/runtime_paths.py)
2. on Windows this resolves to `%LOCALAPPDATA%\\Horalix Pulse Server\\cache\\logs\\horalix.log`

Electron path helpers:

1. preload exposes `getAppPaths()` from [`preload.ts`](../electron/preload.ts)

## Common Failures

### Docker Is Not Running

Symptoms:

1. packaged server exits during startup
2. preflight reports Docker daemon is not reachable

Actions:

1. start Docker Desktop
2. confirm `docker info` succeeds
3. relaunch the packaged server

### Backend Port Already In Use

Symptoms:

1. dev scripts fail fast before Electron opens
2. packaged server backend startup reports port collision

Actions:

1. stop the process already bound to `3000` or `8000`
2. rerun the startup script or packaged server

Relevant files:

1. [`scripts/dev-start.ps1`](../scripts/dev-start.ps1)
2. [`scripts/dev-lan.ps1`](../scripts/dev-lan.ps1)
3. [`backend.ts`](../electron/backend.ts)

### Client Cannot Reach Server

Symptoms:

1. login page loads but requests fail
2. client first-run setup never completes

Actions:

1. confirm the saved server address in the client runtime config
2. confirm `http://<server-host>:8000/api/health` is reachable from the client machine
3. confirm the viewer address is reachable on port `3001`

### Packaged Server Preflight Fails

Symptoms:

1. server window exits immediately
2. no new backend log lines are written

Actions:

1. run the checks from [`server_preflight.ps1`](../scripts/server_preflight.ps1) manually
2. verify required env keys in the packaged backend `.env`
3. verify Docker and, when enabled, WSL/vLLM availability
4. verify the effective license storage directory is writable

### WebAuthn Works In Dev but Not in Packaged Release Docs

Behavior:

1. source and dev builds expose FastAPI docs at `/docs`
2. packaged release mode disables FastAPI docs and OpenAPI

Implementation reference:

1. [`main.py`](../backend/app/main.py)

### Viewer or Study Results Look Stale

Actions:

1. check pipeline status and result observer routes first
2. verify the renderer is reading the correct runtime config
3. for packaged server mode, confirm managed viewer resources were started successfully through [`infrastructure.ts`](../electron/infrastructure.ts)

## Useful Commands

Backend tests:

```powershell
npm run test:backend
```

Frontend tests:

```powershell
npm run test:frontend
```

Frontend production build:

```powershell
npm run build:frontend
```

Electron TypeScript build:

```powershell
npm run build:electron
```

Packaged server build:

```powershell
npm run pack:server
```

Packaged client installer build:

```powershell
npm run dist:client
```
