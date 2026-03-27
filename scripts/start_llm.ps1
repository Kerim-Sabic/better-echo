function Get-EnvOrDefault {
    param(
        [string]$Name,
        [string]$Default
    )

    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name))) {
        return $Default
    }

    return [Environment]::GetEnvironmentVariable($Name)
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

$wslDistro = Get-EnvOrDefault -Name "LLM_WSL_DISTRO" -Default "Ubuntu"
$venvPath = Get-EnvOrDefault -Name "LLM_VENV_PATH" -Default "~/vllm"
$gpuIndex = Get-EnvOrDefault -Name "LLM_GPU_INDEX" -Default "1"
$llmModel = Get-EnvOrDefault -Name "LLM_MODEL" -Default "Qwen/Qwen2.5-14B-Instruct-AWQ"
$llmBaseUrl = Get-EnvOrDefault -Name "LLM_BASE_URL" -Default "http://localhost:8012/v1"
$maxModelLen = Get-EnvOrDefault -Name "LLM_SERVER_MAX_LEN" -Default "16384"
$hfHome = [Environment]::GetEnvironmentVariable("HF_HOME")
$activatePath = "$venvPath/bin/activate"
$activatePathExpression = Convert-ToBashPathExpression -Value $activatePath

try {
    $llmPort = ([Uri]$llmBaseUrl).Port
    if ($llmPort -le 0) {
        $llmPort = 8012
    }
} catch {
    $llmPort = 8012
}

$bashLines = @(
    "source ~/.bashrc",
    "source $activatePathExpression",
    "export CUDA_VISIBLE_DEVICES=$gpuIndex"
)

if (-not [string]::IsNullOrWhiteSpace($hfHome)) {
    $hfHomeQuoted = Convert-ToBashSingleQuoted $hfHome
    $bashLines += "export HF_HOME=`"$(wslpath $hfHomeQuoted)`""
}

$bashLines += "vllm serve $(Convert-ToBashSingleQuoted $llmModel) --quantization awq_marlin --dtype float16 --kv-cache-dtype fp8 --tensor-parallel-size 1 --max-model-len $maxModelLen --gpu-memory-utilization 0.90 --max-num-seqs 2 --enforce-eager --port $llmPort"

$bashCommand = $bashLines -join "`n"

wsl.exe -d $wslDistro -- bash -lc $bashCommand
