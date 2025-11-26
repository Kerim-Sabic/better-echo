# PowerShell script for starting Echocardiology Desktop App in DEV mode (without LLM)
# Uses try/finally for consistent structure (though no LLM cleanup needed)

Write-Host "Starting Echocardiology Desktop App in DEV mode (without LLM)..." -ForegroundColor Cyan
Write-Host ""
Write-Host "This will:"
Write-Host "  - Start Orthanc/backend/frontend/Electron dev stack"
Write-Host "  - LLM features will be disabled"
Write-Host ""

# Change to project root
Set-Location "$PSScriptRoot\.."

# Set environment variable for Electron
$env:ENABLE_LLM = "false"

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
    npm run dev
} finally {
    # No LLM cleanup needed, but keeping structure for consistency
    Write-Host ""
    Write-Host "Cleanup complete." -ForegroundColor Green
}
