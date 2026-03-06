# PowerShell script for starting Echocardiology Desktop App in LAN DEV mode (without LLM)
# Uses try/finally for consistent structure.

Write-Host "Starting Echocardiology Desktop App in LAN DEV mode (without LLM)..." -ForegroundColor Cyan
Write-Host ""
Write-Host "This will:"
Write-Host "  - Start Orthanc/backend/frontend/Electron dev stack"
Write-Host "  - Backend will bind to 0.0.0.0:8000 (LAN reachable)"
Write-Host "  - LLM features will be disabled"
Write-Host ""

# Part 0. Fail fast when dev ports are already in use.
function Test-PortAvailable([int]$Port, [string]$Name) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) {
        return
    }
    $pid = $listener.OwningProcess
    $procName = "unknown"
    try {
        $proc = Get-Process -Id $pid -ErrorAction Stop
        $procName = $proc.ProcessName
    } catch {
        $procName = "pid-$pid"
    }
    throw "$Name port $Port is already in use by $procName (PID $pid). Stop it first, then rerun this script."
}

# Part 1. Detect best LAN IPv4 from default route interface.
$lanIp = $null
try {
    $defaultRoute = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction Stop |
        Sort-Object RouteMetric, InterfaceMetric |
        Select-Object -First 1
    if ($defaultRoute) {
        $lanIp = Get-NetIPAddress -InterfaceIndex $defaultRoute.InterfaceIndex -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
            Select-Object -First 1 -ExpandProperty IPAddress
    }
} catch {
    $lanIp = $null
}
if ($lanIp) {
    Write-Host "LAN test URL: http://$lanIp`:3000" -ForegroundColor Green
    Write-Host ""
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
    Write-Host "Starting LAN dev stack (backend/frontend/electron)..." -ForegroundColor Yellow
    Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Gray
    Write-Host ""

    # Run LAN dev stack (this blocks until Ctrl+C or quit)
    npm run dev:lan
} finally {
    Write-Host ""
    Write-Host "Cleanup complete." -ForegroundColor Green
}
