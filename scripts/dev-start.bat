@echo off
echo Starting Echocardiology Desktop App in DEV mode...
echo.
echo This will start:
echo   1. PostgreSQL (Docker)
echo   2. Orthanc DICOM server (Docker)
echo   3. OHIF viewer (Docker) on http://localhost:3001
echo   4. FastAPI backend on http://127.0.0.1:8000
echo   5. React frontend on http://localhost:3000
echo   6. Electron app connecting to all services
echo.

cd /d "%~dp0\.."

echo Checking Docker and starting local infrastructure (Docker Compose)...
docker --version >NUL 2>&1
if %errorlevel% neq 0 (
    echo Docker is not available. Skipping PostgreSQL/Orthanc/OHIF startup.
) else (
    rem Try new 'docker compose' first
    docker compose -f docker-compose.yml up -d postgres orthanc horalix-viewer >NUL 2>&1
    if %errorlevel% neq 0 (
        echo 'docker compose' failed, trying 'docker-compose' for PostgreSQL/Orthanc/OHIF...
        docker-compose -f docker-compose.yml up -d postgres orthanc horalix-viewer
    ) else (
        echo PostgreSQL, Orthanc, and OHIF started via 'docker compose'.
    )
)

if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
)

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

if not exist "backend\app\logs" (
    mkdir backend\app\logs
)

rem Use PowerShell script for better Ctrl+C handling
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-start.ps1"
