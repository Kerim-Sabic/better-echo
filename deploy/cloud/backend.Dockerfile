# Linux GPU image for the FastAPI backend in the AWS cloud trial deployment.
#
# Build context MUST be the repo root so the COPY paths resolve, e.g.:
#   docker build -f deploy/cloud/backend.Dockerfile -t horalix/echo-backend:dev .
#
# Notes:
# - backend/requirements.txt is UTF-16 (PowerShell-authored on Windows). We
#   convert it to UTF-8 during the build so apt-installed pip can read it.
# - pywin32 is Windows-only and is filtered out before pip install.
# - AI model weights are NOT baked into the image. They are mounted from the
#   EC2 host at /app/models (sourced from /var/lib/horalix/models on EBS).
#   bootstrap.sh on the host downloads them once on first boot.

# CPU-only default. For GPU instances pass: --build-arg BASE_IMAGE=nvidia/cuda:12.6.2-cudnn-runtime-ubuntu22.04
ARG BASE_IMAGE=python:3.11-slim
FROM ${BASE_IMAGE}

ARG BASE_IMAGE=python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
        ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Convert requirements.txt UTF-16 -> UTF-8, strip pywin32, then install.
# torch/torchvision/torchaudio with +cu129 suffix come from the PyTorch index.
# TORCH_INDEX controls the PyTorch wheel variant:
#   cpu    → CPU-only (default, works on any instance)
#   cu126  → CUDA 12.6 (use with BASE_IMAGE=nvidia/cuda on GPU instances)
ARG TORCH_INDEX=cpu

COPY backend/requirements.txt /tmp/requirements.utf16.txt
RUN iconv -f UTF-16 -t UTF-8 /tmp/requirements.utf16.txt \
        | sed -e '1s/^\xEF\xBB\xBF//' \
              -e '/^pywin32==/d' \
              -e '/^pywin32 /d' \
              -e "s/+cu[0-9]*/+${TORCH_INDEX}/g" \
        > /tmp/requirements.txt \
    && pip install --upgrade pip \
    && pip install \
        --extra-index-url "https://download.pytorch.org/whl/${TORCH_INDEX}" \
        -r /tmp/requirements.txt

COPY backend/ /app/

# Image-intrinsic defaults: the container always binds 0.0.0.0:8000 (matches
# EXPOSE and the uvicorn CMD below). Deployment config (LICENSE_STORAGE_DIR,
# CORS_ORIGIN, COOKIE_SECURE, etc.) is NOT set here — it comes from the
# generated .env via docker-compose, the single source of runtime config.
ENV BACKEND_HOST=0.0.0.0 \
    BACKEND_PORT=8000

EXPOSE 8000

# --proxy-headers makes Starlette trust X-Forwarded-* from Caddy (W3 §3.3).
CMD ["python", "-m", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--proxy-headers", "--forwarded-allow-ips=*"]
