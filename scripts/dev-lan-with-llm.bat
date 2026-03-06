@echo off
echo Starting Echocardiology Desktop App in LAN DEV mode with LLM...
echo.
echo This will start:
echo   1. Orthanc DICOM server (Docker)
echo   2. FastAPI backend on http://0.0.0.0:8000 (LAN reachable)
echo   3. React frontend on http://localhost:3000
echo   4. Electron app connecting to all services
echo   5. LLM service (vLLM in WSL)
echo.

cd /d "%~dp0\.."

echo Checking Docker and starting Orthanc (Docker Compose)...
docker --version >NUL 2>&1
if %errorlevel% neq 0 (
    echo Docker is not available. Skipping Orthanc startup.
) else (
    rem Try new 'docker compose' first
    docker compose -f docker-compose.yml up -d orthanc >NUL 2>&1
    if %errorlevel% neq 0 (
        echo 'docker compose' failed, trying 'docker-compose'...
        docker-compose -f docker-compose.yml up -d orthanc
    ) else (
        echo Orthanc started via 'docker compose'.
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
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-lan-with-llm.ps1"
