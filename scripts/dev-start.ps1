# PowerShell script for starting Echocardiology Desktop App in DEV mode (without LLM)
# Uses try/finally for consistent structure (though no LLM cleanup needed)

Write-Host "Starting Echocardiology Desktop App in DEV mode (without LLM)..." -ForegroundColor Cyan
Write-Host ""
Write-Host "This will:"
Write-Host "  - Start Orthanc/backend/frontend/Electron dev stack"
Write-Host "  - LLM features will be disabled"
Write-Host ""

# Part 0. Fail fast when dev ports are already in use.
function Test-PortAvailable([int]$Port, [string]$Name) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) {
        return
    }
    $owningProcessId = $listener.OwningProcess
    $procName = "unknown"
    try {
        $proc = Get-Process -Id $owningProcessId -ErrorAction Stop
        $procName = $proc.ProcessName
    } catch {
        $procName = "pid-$owningProcessId"
    }
    throw "$Name port $Port is already in use by $procName (PID $owningProcessId). Stop it first, then rerun this script."
}

# Change to project root
Set-Location "$PSScriptRoot\.."

# Set environment variable for Electron
$env:ENABLE_LLM = "false"

try {
    Test-PortAvailable -Port 3000 -Name "Frontend"
    Test-PortAvailable -Port 8000 -Name "Backend"

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
