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
require_env RELEASE_S3_URI
# EBS_DEVICE is optional: step 1 auto-detects the data volume and only falls back
# to EBS_DEVICE if detection fails (it no longer trusts a hardcoded /dev/nvmeXn1).

HORALIX_ROOT=/var/lib/horalix
MARKERS="$HORALIX_ROOT/.markers"
SOURCE_DIR=/opt/horalix
DEPLOY_DIR="$SOURCE_DIR/deploy/cloud"

mark_done() { mkdir -p "$MARKERS" && touch "$MARKERS/$1"; }
is_done()  { [[ -f "$MARKERS/$1" ]]; }

# -------------------------------------------------------------------------
# 1. Mount the EBS data volume at /var/lib/horalix
#
# The device name is NOT fixed. On instance types with local instance store
# (e.g. g5), the ephemeral NVMe claims /dev/nvme1n1 and the data EBS volume
# lands on /dev/nvme2n1 — so a hardcoded path silently mounts nothing and
# everything writes to the root disk. We instead detect the data volume by its
# NVMe model ("Amazon Elastic Block Store"), excluding the root disk, and fail
# loudly if it does not end up mounted.
# -------------------------------------------------------------------------
find_data_ebs_device() {
    local root_disk dev base model
    root_disk=$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null)
    for dev in /dev/nvme*n1; do
        [[ -b "$dev" ]] || continue
        base="${dev#/dev/}"
        [[ "$base" == "$root_disk" ]] && continue
        model=$(cat "/sys/block/$base/device/model" 2>/dev/null || true)
        # Instance store reports "Amazon EC2 NVMe Instance Storage"; only EBS
        # volumes report "Amazon Elastic Block Store".
        [[ "$model" == *"Elastic Block Store"* ]] || continue
        echo "$dev"; return 0
    done
    return 1
}

if ! is_done ebs-mounted; then
    DATA_DEV="$(find_data_ebs_device || true)"
    DATA_DEV="${DATA_DEV:-${EBS_DEVICE:-}}"
    if [[ -z "$DATA_DEV" || ! -b "$DATA_DEV" ]]; then
        echo "FATAL: could not locate the data EBS volume (an Amazon EBS NVMe device that is not the root disk)" >&2
        lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINT >&2 || true
        exit 1
    fi
    log "Preparing data EBS volume $DATA_DEV -> $HORALIX_ROOT"
    if ! blkid "$DATA_DEV" >/dev/null 2>&1; then
        mkfs.ext4 -L horalix-data "$DATA_DEV"
    fi
    mkdir -p "$HORALIX_ROOT"
    if ! grep -q "LABEL=horalix-data" /etc/fstab; then
        echo "LABEL=horalix-data $HORALIX_ROOT ext4 defaults,nofail 0 2" >> /etc/fstab
    fi
    mount -a
    # Do NOT trust nofail's silent skip: confirm the data volume actually mounted,
    # otherwise the whole stack writes to the root disk unnoticed.
    if ! mountpoint -q "$HORALIX_ROOT"; then
        echo "FATAL: $HORALIX_ROOT is not a separate mount after 'mount -a'; data EBS volume ($DATA_DEV) failed to mount" >&2
        exit 1
    fi
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
    # The Deep Learning Base AMI already ships Docker and (usually) the NVIDIA
    # Container Toolkit, with the NVIDIA apt repo + keyring pre-configured. In
    # that case re-running `gpg --dearmor` onto the existing keyring file makes
    # gpg prompt "File exists. Overwrite?" and — with no TTY under cloud-init —
    # abort with "cannot open '/dev/tty'", which under `set -o pipefail` killed
    # the entire bootstrap before it ever built anything. So: if nvidia-ctk is
    # already present, skip the apt dance and just point Docker at it. Only
    # install from scratch on a bare AMI, and pass `--yes` so the dearmor never
    # blocks on an overwrite prompt.
    if command -v nvidia-ctk >/dev/null 2>&1; then
        log "NVIDIA Container Toolkit already present (Deep Learning AMI); configuring Docker runtime"
    else
        log "Installing NVIDIA Container Toolkit"
        distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
        curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
            | gpg --dearmor --yes -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
        curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list \
            | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
            > /etc/apt/sources.list.d/nvidia-container-toolkit.list
        apt-get update -y
        apt-get install -y nvidia-container-toolkit
    fi
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
    --exclude "*/.cache/*" \
    --exclude "*/venv/*" \
    --exclude "*/.venv/*"

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
# Torch wheel variant consumed as a build arg by the backend image: CUDA 12.6
# wheels on GPU instances (so the echo models run on the GPU), CPU otherwise.
if [[ "${ENABLE_GPU:-false}" == "true" ]]; then TORCH_INDEX=cu126; else TORCH_INDEX=cpu; fi
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
# PyTorch wheel variant for the backend image build (cu126 on GPU, cpu otherwise).
TORCH_INDEX=${TORCH_INDEX}

# --- Derived from the per-tenant DOMAIN ------------------------------------
# Includes the packaged desktop client's loopback origin (staticServer.ts serves
# the renderer at http://127.0.0.1:17645). The client's CORS preflight must be
# allowed natively here: Electron 31 enforces CORS in the network service before
# webRequest header rewrites apply, so the in-app interceptor can't rescue a
# rejected preflight. Keep the port in sync with electron/staticServer.ts.
CORS_ORIGIN=["https://${DOMAIN}","http://127.0.0.1:17645","http://localhost:17645"]

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
# On GPU deployments, layer the GPU override (adds a GPU reservation to the
# backend so the echo models run on CUDA) and enable the "gpu" profile (which
# starts the vLLM service for report generation).
COMPOSE_FILES=(-f docker-compose.cloud.yml)
UP_EXTRA=()
if [[ "${ENABLE_GPU:-false}" == "true" ]]; then
    COMPOSE_FILES+=(-f docker-compose.cloud.gpu.yml)
    UP_EXTRA+=(--profile gpu)
fi
# Build images one at a time to avoid OOM on memory-constrained instances.
# Parallel builds (default) crash the Docker daemon on small instances.
log "Building backend image"
docker compose "${COMPOSE_FILES[@]}" --env-file .env build backend
log "Building horalix-viewer image"
docker compose "${COMPOSE_FILES[@]}" --env-file .env build horalix-viewer
# Reclaim the (large) build cache before `up`. On GPU tenants `up` then builds
# the vLLM image, whose layers extract to ~25GB; the ~45GB of backend build
# cache left over from the step above would otherwise fill the root volume mid-
# extraction ("no space left on device"). This removes cache only — the
# backend/viewer images just built are kept, so `up` reuses them.
log "Pruning build cache to free space before starting services"
docker builder prune -af || true
log "Starting all services"
docker compose "${COMPOSE_FILES[@]}" --env-file .env "${UP_EXTRA[@]}" up -d

log "Bootstrap complete. Caddy will obtain a Let's Encrypt cert for $DOMAIN"
log "once the Route53 A record is live and propagated."
