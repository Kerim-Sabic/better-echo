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
3. OHIF viewer:
1. `http://localhost:3001`
4. Frontend (dev):
1. `http://localhost:3000`
5. Frontend (LAN dev):
1. `http://<your-lan-ip>:3000`

## LAN Device Cannot Connect

Symptoms:

1. App loads on host machine but not on another device in same network.
2. Login/API calls from second device fail or timeout.

Actions:

1. Start LAN stack instead of localhost-only stack:

```powershell
scripts\dev-lan.bat
