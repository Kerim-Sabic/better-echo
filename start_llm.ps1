$env:HF_HOME="C:\Users\kerim\OneDrive\Desktop\hf-cache"
wsl.exe -d Ubuntu -- bash -lc "
  export HF_HOME='/mnt/c/Users/kerim/OneDrive/Desktop/hf-cache' &&
  export CUDA_VISIBLE_DEVICES=0 &&
  conda activate vllm &&
  vllm serve Qwen/Qwen2.5-14B-Instruct-AWQ \
    --quantization awq_marlin \
    --dtype float16 \
    --kv-cache-dtype fp8 \
    --tensor-parallel-size 1 \
    --max-model-len 16384 \
    --gpu-memory-utilization 0.90 \
    --max-num-seqs 2 \
    --enforce-eager \
    --port 8012
"
