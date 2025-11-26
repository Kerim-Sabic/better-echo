# PowerShell script for starting Echocardiology Desktop App in DEV mode with LLM
# Uses try/finally to ensure LLM cleanup runs on Ctrl+C (first press)

Write-Host "Starting Echocardiology Desktop App in DEV mode with LLM..." -ForegroundColor Cyan
Write-Host ""
Write-Host "This will:"
Write-Host "  - Start Orthanc/backend/frontend/Electron dev stack"
Write-Host "  - Electron will auto-start the LLM service in background"
Write-Host ""

# Change to project root
Set-Location "$PSScriptRoot\.."

# Set environment variable for Electron
$env:ENABLE_LLM = "true"

try {
    # Build Electron
    Write-Host "Building Electron..." -ForegroundColor Yellow
    npm run build:electron
    if ($LASTEXITCODE -ne 0) {
        throw "Electron build failed"
    }

    Write-Host ""
    Write-Host "Starting dev stack (backend/frontend/electron)..." -ForegroundColor Yellow
    Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Gray
    Write-Host ""

    # Run dev stack (this blocks until Ctrl+C or quit)
    npm run dev:llm
} finally {
    # This ALWAYS runs, even on Ctrl+C
    Write-Host ""
    Write-Host "Cleaning up LLM process..." -ForegroundColor Yellow
    & "$PSScriptRoot\stop_llm.ps1"
    Write-Host "Cleanup complete." -ForegroundColor Green
}
