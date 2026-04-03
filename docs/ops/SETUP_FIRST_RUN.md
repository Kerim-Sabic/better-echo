# Setup First Run

Last Updated: 2026-03-18  
Owner: Engineering

## Goal

Get a clean machine from zero to a running local desktop app.

## Step-by-Step

### 1) Prerequisites

Install:

1. Node.js 20+ and npm.
2. Python 3.11+.
3. Git.
4. Docker Desktop.

Verify:

```powershell
node -v
npm -v
python --version
docker --version
```

### 2) Clone and Install Dependencies

```powershell
git clone <repo-url>
cd Echocardiology_App
npm install
```

Notes:

1. Root [`package.json`](../../package.json#L25) has a `postinstall` hook that installs frontend dependencies.
2. Helper scripts also perform missing dependency checks.

### 3) Python Virtual Environment

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..
```

### 4) Environment Files

Create:

1. `backend/.env` from [`backend/.env.example`](../../backend/.env.example)
2. `frontend/.env` from [`frontend/.env.example`](../../frontend/.env.example)

Typical local defaults:

### backend/.env

```env
CORS_ORIGIN=["http://localhost:3000"]
ORTHANC_URL="http://localhost:8042"
ORTHANC_USER="orthanc"
ORTHANC_PASS="orthanc"
DATABASE_URL="postgresql+psycopg://horalix:horalix_dev@localhost:5433/horalix"
TEST_DATABASE_URL="postgresql+psycopg://horalix:horalix_dev@localhost:5433/horalix_test"
SECRET_KEY=replace-me
TOKEN_EXPIRE_HOURS=4
PANECHO_PRELOAD=true
ECHOPRIME_PRELOAD=true
ECHONET_PRELOAD=true
MEASUREMENTS_PRELOAD=true
```

### frontend/.env

```env
REACT_APP_API_URL=http://localhost:8000/api
REACT_APP_API_URL_UPLOADS=http://localhost:8000/uploads
REACT_APP_VIEWER_URL=http://localhost:8042/stone-webviewer/index.html
```

### 5) Start Development Stack

Without LLM:

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

Script references:

1. [`dev-start.bat`](../../scripts/dev-start.bat)
2. [`dev-start-with-llm.bat`](../../scripts/dev-start-with-llm.bat)
3. [`dev-start.ps1`](../../scripts/dev-start.ps1)
4. [`dev-start-with-llm.ps1`](../../scripts/dev-start-with-llm.ps1)

What starts:

1. PostgreSQL (Docker).
2. Orthanc (Docker).
3. OHIF viewer (Docker).
4. FastAPI backend (`127.0.0.1:8000`).
5. React frontend (`localhost:3000`).
6. Electron desktop window.

### 6) Manual Fallback Commands

If helper scripts fail:

```powershell
npm run build:electron
npm run dev
```

Enable LLM path:

```powershell
npm run build:electron
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

### 7) First Validation Checklist

1. App opens to splash, then login.
2. Login works.
3. Dashboard loads studies.
4. New Study upload succeeds.
5. StudyResults polling progresses and data appears.

### 8) Common First-Run Issues

1. Docker not running:
1. Start Docker Desktop and rerun startup script.
2. Missing Python packages:
1. Re-activate venv and rerun `pip install -r requirements.txt`.
3. Missing PostgreSQL schema:
1. From `backend/`: `python -m app.database.setup_db`.
4. Missing Postgres test DB:
1. Run `docker exec horalix_postgres psql -U horalix -d postgres -c "CREATE DATABASE horalix_test;"`.
5. LLM process stale:
1. Run `scripts\stop_llm.ps1` then restart with LLM script.
2. Script reference: [`stop_llm.ps1`](../../scripts/stop_llm.ps1)
