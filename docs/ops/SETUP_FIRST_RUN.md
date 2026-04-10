# Setup First Run

Last Updated: 2026-04-04  
Owner: Engineering

## Goal

Prepare a clean machine for local development and basic desktop verification.

## 1. Prerequisites

Install:

1. Node.js 20+
2. npm
3. Python 3.11+
4. Git
5. Docker Desktop

Verify:

```powershell
node -v
npm -v
python --version
docker --version
```

## 2. Clone and Install

```powershell
git clone <repo-url>
cd Echocardiology_App
npm install
```

Notes:

1. Root [`package.json`](../../package.json) installs frontend dependencies through `postinstall`.
2. Development and packaging commands are defined in the same file.

## 3. Python Virtual Environment

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..
```

## 4. Environment Files

Create:

1. `backend/.env` from [`backend/.env.example`](../../backend/.env.example)
2. `frontend/.env` from [`frontend/.env.example`](../../frontend/.env.example)

Minimum backend values for local dev:

1. `CORS_ORIGIN`
2. `ORTHANC_URL`
3. `ORTHANC_USER`
4. `ORTHANC_PASS`
5. `DATABASE_URL`
6. `TEST_DATABASE_URL`
7. `SECRET_KEY`
8. `TOKEN_EXPIRE_HOURS`

Common local runtime knobs:

1. `PRIMARY_ANALYSIS_PRELOAD`
2. `SECONDARY_ANALYSIS_PRELOAD`
3. `MOTION_SEGMENTATION_PRELOAD`
4. `STUDY_MEASUREMENTS_PRELOAD`
5. `ENABLE_LLM`

Minimum frontend values:

1. `REACT_APP_API_URL`
2. `REACT_APP_API_URL_UPLOADS`
3. `REACT_APP_VIEWER_URL`

The canonical runtime knobs live in:

1. [`backend/.env.example`](../../backend/.env.example)
2. [`config.py`](../../backend/app/core/config.py)

## 5. Start the Development Stack

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

PowerShell equivalents are available under [`scripts/`](../../scripts/).

What starts:

1. PostgreSQL
2. Orthanc
3. OHIF viewer
4. FastAPI backend
5. React frontend
6. Electron desktop window

## 6. Manual Fallback Commands

Build Electron first:

```powershell
npm run build:electron
```

Run the default dev stack:

```powershell
npm run dev
```

Run the LLM dev stack:

```powershell
npm run dev:llm
```

Run backend only:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Run frontend only:

```powershell
cd frontend
npm start
```

## 7. First Validation Checklist

1. Splash opens, then routes to login.
2. Login works.
3. Dashboard loads studies.
4. New Study upload succeeds.
5. Study Results polls and updates.

## 8. Common First-Run Issues

1. Docker not running
   - start Docker Desktop and rerun the dev script
2. Missing Python packages
   - reactivate `backend/venv` and rerun `pip install -r requirements.txt`
3. Missing schema
   - run `python -m app.database.setup_db` from `backend/`
4. Missing test database
   - create the configured `TEST_DATABASE_URL` database in Postgres
5. Stale LLM process
   - run [`stop_llm.ps1`](../../scripts/stop_llm.ps1) and restart with an LLM-enabled script

## 9. Packaged Builds

Server package:

```powershell
npm run pack:server
```

Client installer:

```powershell
npm run dist:client
```

Packaged server uses the generated runtime env from [`generate_release_config.py`](../../backend/desktop/generate_release_config.py) during backend packaging.
