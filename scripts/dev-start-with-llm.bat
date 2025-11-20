@echo off
setlocal
echo Starting Echocardiology Desktop App in DEV mode with LLM...
echo.
echo This will:
echo   - Start the local LLM (background) via scripts\start_llm.ps1
echo   - Start Orthanc/backend/frontend/Electron dev stack (via dev-start.bat)
echo.

cd /d "%~dp0\\.."

set "LLM_START=%CD%\\scripts\\start_llm.ps1"
set "LLM_STOP=%CD%\\scripts\\stop_llm.ps1"

if exist "%LLM_START%" (
    echo Starting LLM (background)...
    start "" powershell -NoProfile -ExecutionPolicy Bypass -File "%LLM_START%"
    set LLM_STARTED=1
) else (
    echo LLM start script not found at %LLM_START%. Skipping LLM startup.
)

call scripts\\dev-start.bat

if defined LLM_STARTED (
    if exist "%LLM_STOP%" (
        echo Stopping LLM...
        powershell -NoProfile -ExecutionPolicy Bypass -File "%LLM_STOP%"
    ) else (
        echo LLM stop script not found at %LLM_STOP%.
    )
)

endlocal
