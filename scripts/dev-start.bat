@echo off
echo Starting Echocardiology Desktop App in DEV mode...
echo.
echo This will start:
echo   1. FastAPI backend on http://127.0.0.1:8000
echo   2. React frontend on http://localhost:3000
echo   3. Electron app connecting to both
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

call npm run build:electron

call npm run dev
