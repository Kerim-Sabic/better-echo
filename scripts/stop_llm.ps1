$wslDistro = if ([string]::IsNullOrWhiteSpace($env:LLM_WSL_DISTRO)) {
    "Ubuntu"
} else {
    $env:LLM_WSL_DISTRO
}

wsl.exe -d $wslDistro -- bash -lc "pkill -f 'vllm serve' || true"
