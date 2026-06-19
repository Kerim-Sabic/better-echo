#!/usr/bin/env bash
# First-boot bootstrap for an EC2 instance hosting one hospital's trial.
#
# Idempotent: safe to re-run after reboots. Each step short-circuits when its
# completion marker exists under /var/lib/horalix/.markers/.
#
# Expected environment (Terraform writes /etc/horalix/bootstrap.env, which the
# user_data sources before invoking this script):
#   DOMAIN                  e.g. acme.echo.horalix.com
#   ACME_EMAIL              ops@horalix.com
#   POSTGRES_PASSWORD       per-tenant secret
#   SECRET_KEY              per-tenant secret
#   LICENSE_PUBLIC_KEY_B64  base64 Ed25519 public key
#   EBS_DEVICE              e.g. /dev/nvme1n1 (the data volume)
#   MODELS_S3_URI           optional, e.g. s3://horalix-models/v1/   (trailing slash)
#   RELEASE_S3_URI          e.g. s3://horalix-releases/v1.0.0/       (versioned snapshot of
#                                                                     the repo subset needed for
#                                                                     the cloud build: backend/,
#                                                                     horalix_viewer/, orthanc/,
#                                                                     deploy/cloud/)
#   BACKEND_IMAGE_TAG, LLM_IMAGE_TAG, VIEWER_IMAGE_TAG (optional)

set -euo pipefail

log() { echo "[bootstrap $(date -u +%H:%M:%S)] $*"; }

require_env() {
    local name="$1"
    if [[ -z "${!name:-}" ]]; then
        echo "FATAL: $name is required" >&2
        exit 1
    fi
}

require_env DOMAIN
require_env ACME_EMAIL
require_env POSTGRES_PASSWORD
require_env SECRET_KEY
require_env LICENSE_PUBLIC_KEY_B64
require_env EBS_DEVICE
require_env RELEASE_S3_URI

HORALIX_ROOT=/var/lib/horalix
MARKERS="$HORALIX_ROOT/.markers"
SOURCE_DIR=/opt/horalix
DEPLOY_DIR="$SOURCE_DIR/deploy/cloud"

mark_done() { mkdir -p "$MARKERS" && touch "$MARKERS/$1"; }
is_done()  { [[ -f "$MARKERS/$1" ]]; }

# -------------------------------------------------------------------------
# 1. Mount the EBS data volume at /var/lib/horalix
# -------------------------------------------------------------------------
if ! is_done ebs-mounted; then
    log "Preparing EBS volume $EBS_DEVICE -> $HORALIX_ROOT"
    if ! blkid "$EBS_DEVICE" >/dev/null 2>&1; then
        mkfs.ext4 -L horalix-data "$EBS_DEVICE"
    fi
    mkdir -p "$HORALIX_ROOT"
    if ! grep -q "LABEL=horalix-data" /etc/fstab; then
        echo "LABEL=horalix-data $HORALIX_ROOT ext4 defaults,nofail 0 2" >> /etc/fstab
    fi
    mount -a
    mark_done ebs-mounted
fi

mkdir -p \
    "$HORALIX_ROOT/postgres-data" \
    "$HORALIX_ROOT/orthanc-data" \
    "$HORALIX_ROOT/licensing" \
    "$HORALIX_ROOT/models" \
    "$HORALIX_ROOT/backend-logs" \
    "$HORALIX_ROOT/caddy/data" \
    "$HORALIX_ROOT/caddy/config"

# -------------------------------------------------------------------------
# 2a. Create a swap file on the root volume.
# pip install for PyTorch + ML deps can exceed 1 GB RAM on t3.micro.
# 4 GB swap gives enough headroom without touching the data EBS volume.
# -------------------------------------------------------------------------
if ! swapon --show | grep -q '/swapfile'; then
    if [[ ! -f /swapfile ]]; then
        log "Creating 4GB swap file"
        fallocate -l 4G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile
        if ! grep -q '/swapfile' /etc/fstab; then
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
        fi
    fi
    swapon /swapfile
fi

# -------------------------------------------------------------------------
# 2. Install Docker + NVIDIA Container Toolkit (Ubuntu 22.04)
# -------------------------------------------------------------------------
if ! is_done docker-installed; then
    log "Installing Docker Engine"
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg awscli jq
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
    mark_done docker-installed
fi

if [[ "${ENABLE_GPU:-false}" == "true" ]] && ! is_done nvidia-toolkit-installed; then
    log "Installing NVIDIA Container Toolkit"
    distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
        | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list \
        | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
        > /etc/apt/sources.list.d/nvidia-container-toolkit.list
    apt-get update -y
    apt-get install -y nvidia-container-toolkit
    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
    mark_done nvidia-toolkit-installed
fi

# -------------------------------------------------------------------------
# 3. Sync the release tree from S3
# The release snapshot must contain at minimum: backend/, horalix_viewer/,
# orthanc/, and deploy/cloud/. docker compose build references repo-relative
# paths (e.g. ../../backend), so the layout under SOURCE_DIR must mirror the
# repo root.
# -------------------------------------------------------------------------
log "Syncing release tree from $RELEASE_S3_URI -> $SOURCE_DIR"
mkdir -p "$SOURCE_DIR"
aws s3 sync --no-progress "$RELEASE_S3_URI" "$SOURCE_DIR" \
    --exclude "*/node_modules/*" \
    --exclude "*/__pycache__/*" \
    --exclude "*/.git/*" \
    --exclude "*/dist/*" \
    --exclude "*/.cache/*"

# -------------------------------------------------------------------------
# 4. Sync AI model weights from S3 (one-shot per release version)
# -------------------------------------------------------------------------
if [[ -n "${MODELS_S3_URI:-}" ]] && ! is_done models-synced; then
    log "Syncing model weights from $MODELS_S3_URI -> $HORALIX_ROOT/models"
    aws s3 sync --no-progress "$MODELS_S3_URI" "$HORALIX_ROOT/models"
    mark_done models-synced
fi

# -------------------------------------------------------------------------
# 5. Render .env for docker-compose
# -------------------------------------------------------------------------
log "Rendering .env for tenant $DOMAIN"
# This heredoc is the SINGLE generator of the runtime .env that
# docker-compose.cloud.yml reads. Every key the compose file references with
# ${VAR} must appear here. Keep the key set in lockstep with
# deploy/cloud/.env.example (the documented template). Sections below separate
# per-tenant values (from Terraform via /etc/horalix/bootstrap.env) from fixed
# cloud defaults that are identical for every tenant.
cat > "$DEPLOY_DIR/.env" <<EOF
# Generated by bootstrap.sh on first boot — DO NOT edit by hand (re-running
# bootstrap overwrites it). Source of truth for cloud runtime config.

# --- Per-tenant (from Terraform / bootstrap.env) ---------------------------
DOMAIN=${DOMAIN}
ACME_EMAIL=${ACME_EMAIL}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
SECRET_KEY=${SECRET_KEY}
LICENSE_PUBLIC_KEY_B64=${LICENSE_PUBLIC_KEY_B64}
REPORTING_MODEL_ID=${REPORTING_MODEL_ID:-local-reporting-model}
TOKEN_EXPIRE_HOURS=${TOKEN_EXPIRE_HOURS:-12}
# LLM is only available on GPU deployments. On CPU-only tenants this is false so
# the pipeline skips the llm stage instead of failing studies on a missing
# llm container. Derived from the Terraform enable_gpu flag.
ENABLE_LLM=${ENABLE_GPU:-false}

# --- Derived from the per-tenant DOMAIN ------------------------------------
CORS_ORIGIN=["https://${DOMAIN}"]

# --- Fixed cloud defaults (identical for every tenant) ---------------------
BACKEND_IMAGE_TAG=${BACKEND_IMAGE_TAG:-dev}
LLM_IMAGE_TAG=${LLM_IMAGE_TAG:-dev}
VIEWER_IMAGE_TAG=${VIEWER_IMAGE_TAG:-cloud}
POSTGRES_DB=horalix
POSTGRES_USER=horalix
ORTHANC_USER=orthanc
ORTHANC_PASS=orthanc
COOKIE_SECURE=true
LICENSE_ENFORCEMENT=true
LICENSE_STORAGE_DIR=/var/lib/horalix/licensing

# --- LLM tuning (only consumed by the gpu-profile llm service) -------------
LLM_SERVER_MAX_LEN=${LLM_SERVER_MAX_LEN:-16384}
LLM_GPU_MEMORY_UTILIZATION=${LLM_GPU_MEMORY_UTILIZATION:-0.60}
LLM_MAX_NUM_SEQS=${LLM_MAX_NUM_SEQS:-2}
EOF
chmod 600 "$DEPLOY_DIR/.env"

# -------------------------------------------------------------------------
# 6. Bring the stack up
# -------------------------------------------------------------------------
log "Starting docker compose"
cd "$DEPLOY_DIR"
# Build images one at a time to avoid OOM on memory-constrained instances.
# Parallel builds (default) crash the Docker daemon on t3.micro.
log "Building backend image"
docker compose -f docker-compose.cloud.yml --env-file .env build backend
log "Building horalix-viewer image"
docker compose -f docker-compose.cloud.yml --env-file .env build horalix-viewer
log "Starting all services"
if [[ "${ENABLE_GPU:-false}" == "true" ]]; then
    docker compose -f docker-compose.cloud.yml --env-file .env --profile gpu up -d
else
    docker compose -f docker-compose.cloud.yml --env-file .env up -d
fi

log "Bootstrap complete. Caddy will obtain a Let's Encrypt cert for $DOMAIN"
log "once the Route53 A record is live and propagated."
