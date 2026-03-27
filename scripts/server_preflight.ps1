param(
    [string]$EnvFilePath
)

function Resolve-BackendEnvPath {
    param([string]$ExplicitPath)

    $candidatePaths = @()
    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        $candidatePaths += $ExplicitPath
    }

    $resourcesRoot = Split-Path -Parent $PSScriptRoot
    $candidatePaths += (Join-Path $resourcesRoot "backend\.env")
    $candidatePaths += (Join-Path $PSScriptRoot "..\backend\.env")

    foreach ($candidate in $candidatePaths) {
        try {
            $resolved = Resolve-Path $candidate -ErrorAction Stop
            return $resolved.Path
        } catch {
        }
    }

    return $null
}

function Read-EnvFile {
    param([string]$Path)

    $values = @{}
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf("=")
        if ($separatorIndex -le 0) {
            continue
        }

        $key = $trimmed.Substring(0, $separatorIndex).Trim()
        $value = $trimmed.Substring($separatorIndex + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        if ($key) {
            $values[$key] = $value
        }
    }

    return $values
}

function Test-CommandAvailable {
    param([string]$CommandName)
    return $null -ne (Get-Command $CommandName -ErrorAction SilentlyContinue)
}

function Test-DockerReady {
    if (-not (Test-CommandAvailable "docker")) {
        return "docker not found on PATH"
    }

    docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        return "docker daemon is not reachable"
    }

    docker compose version *> $null
    if ($LASTEXITCODE -eq 0) {
        return $null
    }

    if (-not (Test-CommandAvailable "docker-compose")) {
        return "neither 'docker compose' nor 'docker-compose' is available"
    }

    docker-compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        return "docker-compose is installed but not working"
    }

    return $null
}

function Test-WslReady {
    param([string]$DistroName)

    if (-not (Test-CommandAvailable "wsl.exe")) {
        return "wsl.exe not found"
    }

    wsl.exe -l -q 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        return "WSL is not installed or not initialized"
    }

    $distros = @(wsl.exe -l -q 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($distros -notcontains $DistroName) {
        return "WSL distro '$DistroName' is not installed"
    }

    return $null
}

function Convert-ToBashSingleQuoted {
    param([string]$Value)

    return "'$Value'"
}

function Convert-ToBashPathExpression {
    param([string]$Value)

    $normalized = ($Value -replace "\\", "/").Trim()
    if ($normalized.StartsWith("~/")) {
        $suffix = $normalized.Substring(2).Replace('"', '\"')
        return "`"`$HOME/$suffix`""
    }

    return Convert-ToBashSingleQuoted -Value $normalized
}

function Test-WslVllmRuntime {
    param(
        [string]$DistroName,
        [string]$VenvPath
    )

    $activatePathExpression = Convert-ToBashPathExpression -Value "$VenvPath/bin/activate"
    $bashCommand = @(
        "source ~/.bashrc >/dev/null 2>&1",
        "test -f $activatePathExpression",
        "source $activatePathExpression",
        "command -v vllm >/dev/null 2>&1"
    ) -join " && "

    wsl.exe -d $DistroName -- bash -lc $bashCommand *> $null
    if ($LASTEXITCODE -eq 0) {
        return $null
    }

    return "Configured LLM virtualenv or vllm entrypoint is missing for distro '$DistroName'"
}

function Test-WritableDirectory {
    param([string]$DirectoryPath)

    try {
        $directory = [System.IO.DirectoryInfo]::new($DirectoryPath)
        if (-not $directory.Exists) {
            $null = New-Item -ItemType Directory -Path $directory.FullName -Force -ErrorAction Stop
        }

        $probePath = Join-Path $directory.FullName ".horalix-write-test"
        Set-Content -Path $probePath -Value "ok" -Encoding UTF8 -ErrorAction Stop
        Remove-Item -Path $probePath -Force -ErrorAction Stop
        return $null
    } catch {
        return $_.Exception.Message
    }
}

function Test-ValidTcpPort {
    param([string]$PortValue)

    $parsedPort = 0
    if (-not [int]::TryParse($PortValue, [ref]$parsedPort)) {
        return "invalid integer value '$PortValue'"
    }

    if ($parsedPort -le 0 -or $parsedPort -gt 65535) {
        return "port '$PortValue' is outside 1-65535"
    }

    return $null
}

$issues = @()
$warnings = @()

$resolvedEnvPath = Resolve-BackendEnvPath -ExplicitPath $EnvFilePath
if (-not $resolvedEnvPath) {
    Write-Error "Could not find backend .env for preflight."
    exit 1
}

$envValues = Read-EnvFile -Path $resolvedEnvPath

$requiredEnvKeys = @(
    "ORTHANC_URL",
    "ORTHANC_USER",
    "ORTHANC_PASS",
    "DATABASE_URL",
    "SECRET_KEY",
    "TOKEN_EXPIRE_HOURS"
)

foreach ($key in $requiredEnvKeys) {
    if (-not $envValues.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envValues[$key])) {
        $issues += "Missing required env key: $key"
    }
}

$backendHost = if ([string]::IsNullOrWhiteSpace($envValues["BACKEND_HOST"])) { "0.0.0.0" } else { $envValues["BACKEND_HOST"] }
$backendPort = if ([string]::IsNullOrWhiteSpace($envValues["BACKEND_PORT"])) { "8000" } else { $envValues["BACKEND_PORT"] }
$backendPortIssue = Test-ValidTcpPort -PortValue $backendPort
if ($backendPortIssue) {
    $issues += "BACKEND_PORT check failed: $backendPortIssue"
}

$dockerIssue = Test-DockerReady
if ($dockerIssue) {
    $issues += "Docker check failed: $dockerIssue"
}

$enableLlmRaw = if ($envValues.ContainsKey("ENABLE_LLM")) { $envValues["ENABLE_LLM"] } else { "true" }
$enableLlm = ($enableLlmRaw.ToLowerInvariant() -eq "true")
if ($enableLlm) {
    $wslDistro = if ([string]::IsNullOrWhiteSpace($envValues["LLM_WSL_DISTRO"])) { "Ubuntu" } else { $envValues["LLM_WSL_DISTRO"] }
    $wslIssue = Test-WslReady -DistroName $wslDistro
    if ($wslIssue) {
        $issues += "WSL check failed: $wslIssue"
    } else {
        $venvPath = if ([string]::IsNullOrWhiteSpace($envValues["LLM_VENV_PATH"])) { "~/vllm" } else { $envValues["LLM_VENV_PATH"] }
        $llmRuntimeIssue = Test-WslVllmRuntime -DistroName $wslDistro -VenvPath $venvPath
        if ($llmRuntimeIssue) {
            $issues += "LLM runtime check failed: $llmRuntimeIssue"
        }
    }
}

$licenseEnforcementRaw = if ($envValues.ContainsKey("LICENSE_ENFORCEMENT")) { $envValues["LICENSE_ENFORCEMENT"] } else { "false" }
$licenseEnforcement = ($licenseEnforcementRaw.ToLowerInvariant() -eq "true")
if ($licenseEnforcement -and [string]::IsNullOrWhiteSpace($envValues["LICENSE_PUBLIC_KEY_B64"])) {
    $issues += "LICENSE_ENFORCEMENT=true but LICENSE_PUBLIC_KEY_B64 is empty"
}

$configuredLicenseStorageDir = $envValues["LICENSE_STORAGE_DIR"]
$effectiveLicenseStorageDir = $configuredLicenseStorageDir
if ([string]::IsNullOrWhiteSpace($effectiveLicenseStorageDir)) {
    $effectiveLicenseStorageDir = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "Horalix Echo\Horalix\licensing"
}

$licenseStorageIssue = Test-WritableDirectory -DirectoryPath $effectiveLicenseStorageDir
if ($licenseStorageIssue) {
    $issues += "LICENSE_STORAGE_DIR is not writable: $licenseStorageIssue"
}

Write-Host "Server preflight"
Write-Host "Env file: $resolvedEnvPath"
Write-Host "BACKEND_HOST=$backendHost"
Write-Host "BACKEND_PORT=$backendPort"
Write-Host "ENABLE_LLM=$enableLlm"
Write-Host "LICENSE_ENFORCEMENT=$licenseEnforcement"

if (-not [string]::IsNullOrWhiteSpace($configuredLicenseStorageDir)) {
    Write-Host "LICENSE_STORAGE_DIR=$configuredLicenseStorageDir"
} else {
    Write-Host "LICENSE_STORAGE_DIR=$effectiveLicenseStorageDir"
}

if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "Warnings:"
    foreach ($warning in $warnings) {
        Write-Host " - $warning"
    }
}

if ($issues.Count -gt 0) {
    Write-Host ""
    Write-Host "Failed checks:"
    foreach ($issue in $issues) {
        Write-Host " - $issue"
    }
    exit 1
}

Write-Host ""
Write-Host "All required preflight checks passed."
exit 0
