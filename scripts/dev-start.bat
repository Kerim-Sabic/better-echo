@echo off
echo Starting Echocardiology Desktop App in DEV mode...
echo.
echo This will start:
echo   1. Orthanc DICOM server (Docker)
echo   2. OHIF viewer (Docker) on http://localhost:3001
echo   3. FastAPI backend on http://127.0.0.1:8000
echo   4. React frontend on http://localhost:3000
echo   5. Electron app connecting to both
echo.

cd /d "%~dp0\.."

echo Checking Docker and starting Orthanc (Docker Compose)...
docker --version >NUL 2>&1
if %errorlevel% neq 0 (
    echo Docker is not available. Skipping Orthanc/OHIF startup.
) else (
    rem Try new 'docker compose' first
    docker compose -f docker-compose.yml up -d orthanc >NUL 2>&1
    if %errorlevel% neq 0 (
        echo 'docker compose' failed, trying 'docker-compose'...
        docker-compose -f docker-compose.yml up -d orthanc
    ) else (
        echo Orthanc started via 'docker compose'.
    )

    echo Starting OHIF viewer ^(Docker Compose^)...
    docker compose -f viewer-ohif/docker-compose.yml up -d horalix-viewer >NUL 2>&1
    if %errorlevel% neq 0 (
        echo 'docker compose' failed for OHIF, trying 'docker-compose'...
        docker-compose -f viewer-ohif/docker-compose.yml up -d horalix-viewer
    ) else (
        echo OHIF started via 'docker compose'.
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
