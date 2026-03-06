# Echocardiology App

AI-powered echocardiography desktop application with:

1. Electron desktop shell.
2. FastAPI backend.
3. React frontend.
4. Orthanc DICOM server (Docker).
5. Local AI inference and optional LLM reporting.

## Quick Start (Windows-first)

### 1) Prerequisites

Install:

1. Node.js 20+ and npm.
2. Python 3.11+.
3. Git.
4. Docker Desktop (for Orthanc).

Verify:

```powershell
node -v
npm -v
python --version
docker --version
```

### 2) Clone and Install

From repo root:

```powershell
npm install
```

Notes:

1. Root `postinstall` runs `cd frontend && npm install` ([`package.json`](./package.json), `package.json:25`).
2. Scripts also perform dependency checks for missing `node_modules`.

### 3) Backend Python Environment

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-dev.txt
cd ..
```

### 4) Environment Files

Copy and edit as needed:

1. `backend/.env.example` -> `backend/.env`
2. `frontend/.env.example` -> `frontend/.env`

Default local values are already suitable for most dev setups:

1. Backend API at `http://127.0.0.1:8000`
2. Frontend at `http://localhost:3000`
3. Orthanc at `http://localhost:8042`

### 5) Start the App

No LLM:

```powershell
scripts\dev-start.bat
```

With LLM:

```powershell
scripts\dev-start-with-llm.bat
```

PowerShell alternatives:

```powershell
.\scripts\dev-start.ps1
.\scripts\dev-start-with-llm.ps1
```

LAN mode (same Wi-Fi/device testing):

```powershell
scripts\dev-lan.bat
scripts\dev-lan-with-llm.bat
```

Script references:

1. [`dev-start.bat`](./scripts/dev-start.bat)
2. [`dev-start-with-llm.bat`](./scripts/dev-start-with-llm.bat)
3. [`dev-start.ps1`](./scripts/dev-start.ps1)
4. [`dev-start-with-llm.ps1`](./scripts/dev-start-with-llm.ps1)
5. [`dev-lan.bat`](./scripts/dev-lan.bat)
6. [`dev-lan-with-llm.bat`](./scripts/dev-lan-with-llm.bat)
7. [`dev-lan.ps1`](./scripts/dev-lan.ps1)
8. [`dev-lan-with-llm.ps1`](./scripts/dev-lan-with-llm.ps1)

What starts:

1. Orthanc container (best effort via Docker Compose).
2. FastAPI backend.
3. React frontend.
4. Electron window.

### 6) Manual Fallback Start

If helper scripts fail:

```powershell
npm run build:electron
npm run dev
```

Or with LLM enabled:

```powershell
npm run build:electron
npm run dev:llm
```

## Common Commands

```powershell
npm run dev              # full stack, LLM disabled
npm run dev:llm          # full stack, LLM enabled
npm run dev:lan          # full stack, backend bound to 0.0.0.0 for LAN
npm run dev:lan:llm      # full stack LAN + LLM
npm run build            # electron + frontend
npm run build:backend    # pyinstaller backend
npm run dist:win         # windows installer
npm run test:backend     # backend pytest suite
npm run test:frontend    # frontend jest suite (CI-style single run)
npm run test:all         # backend + frontend
```

Frontend-only:

```powershell
cd frontend
npm test
npm run build
```

## Troubleshooting

1. Docker unavailable:
1. `dev-start` scripts continue, but Orthanc is skipped.
2. Start Docker Desktop and rerun script.
2. DB schema mismatch after model changes:
1. From `backend/`: `python -m app.database.setup_db` (destructive reset for local dev).
3. LLM process issues:
1. Use `scripts\stop_llm.ps1` then restart with `dev-start-with-llm`.
2. LLM stop script: [`stop_llm.ps1`](./scripts/stop_llm.ps1)

Detailed runbook:

1. [`RUNBOOK.md`](./docs/RUNBOOK.md)
2. [`SETUP_FIRST_RUN.md`](./docs/ops/SETUP_FIRST_RUN.md)

## Documentation

Start here:

1. [`HANDBOOK.md`](./docs/HANDBOOK.md) for system overview and architecture map.
2. [`docs/README.md`](./docs/README.md) for docs index.
