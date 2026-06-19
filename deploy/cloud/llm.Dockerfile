# vLLM image for the cloud server stack.
#
# We use the official vllm/vllm-openai image, which already ships the
# OpenAI-compatible HTTP server and CUDA runtime. The on-prem build runs vLLM
# inside WSL via scripts/start_llm.ps1; here it is a long-lived container with
# the host GPU exposed via the NVIDIA Container Toolkit.
#
# Model weights are mounted at /models from the host at runtime so the image
# stays small and the same image works for any tenant.
#
# Build with the repo root as context:
#   docker build -f deploy/cloud/llm.Dockerfile -t horalix/vllm:dev .

FROM vllm/vllm-openai:latest

# Pinned defaults that mirror scripts/start_llm.ps1.
# Override via env in docker-compose.cloud.yml.
ENV LLM_MODEL=local-reporting-model \
    LLM_PORT=8012 \
    LLM_MAX_MODEL_LEN=16384 \
    LLM_GPU_MEMORY_UTILIZATION=0.90 \
    LLM_MAX_NUM_SEQS=2 \
    HF_HOME=/models/hf-cache

EXPOSE 8012

ENTRYPOINT []
CMD ["bash", "-c", "\
    vllm serve \"${LLM_MODEL}\" \
        --quantization awq_marlin \
        --dtype float16 \
        --kv-cache-dtype fp8 \
        --tensor-parallel-size 1 \
        --max-model-len \"${LLM_MAX_MODEL_LEN}\" \
        --gpu-memory-utilization \"${LLM_GPU_MEMORY_UTILIZATION}\" \
        --max-num-seqs \"${LLM_MAX_NUM_SEQS}\" \
        --enforce-eager \
        --port \"${LLM_PORT}\" \
        --host 0.0.0.0 \
"]
