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
    rem ---------------------------------------------------------------
    rem Optional: Auto-start Docker Desktop and wait for engine (DISABLED)
    rem To enable, remove the leading REMs on this block.
    rem ---------------------------------------------------------------
    rem echo Checking Docker Engine status...
    rem docker info >NUL 2>&1
    rem if %errorlevel% neq 0 (
    rem     echo Docker Engine not ready. Attempting to start Docker Desktop...
    rem     rem Common install path for Docker Desktop (adjust if custom path)
    rem     if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    rem         start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    rem     ) else if exist "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe" (
    rem         start "" "%ProgramFiles(x86)%\Docker\Docker\Docker Desktop.exe"
    rem     ) else (
    rem         echo Could not locate Docker Desktop executable. Please start it manually.
    rem     )
    rem     set /a __DOCKER_WAIT=0
    rem     :__WAIT_DOCKER
    rem     docker info >NUL 2>&1
    rem     if %errorlevel% neq 0 (
    rem         set /a __DOCKER_WAIT+=1
    rem         if %__DOCKER_WAIT% GEQ 60 (
    rem             echo Timed out waiting for Docker Engine (60s). Continuing without Orthanc.
    rem             goto __AFTER_DOCKER
    rem         )
    rem         timeout /t 1 /nobreak >NUL
    rem         goto __WAIT_DOCKER
    rem     )
    rem     echo Docker Engine is ready.
    rem ) else (
    rem     echo Docker Engine is ready.
    rem )
    rem :__AFTER_DOCKER

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
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-start.ps1"
