#!/usr/bin/env bash
# Two-phase license issuance for a Horalix Echo trial EC2.
#
# Phase 1 — read the machine fingerprint from the running backend:
#   SSM -> docker exec horalix_backend curl /api/licensing/activation-request
#
# Phase 2 — sign a license locally with the operator's Ed25519 private key
# (scripts/license_tool.py) and POST it back to /api/licensing/import.
#
# The licensing admin endpoints are gated by require_loopback_request on the
# backend, so we drive them via `docker exec` from inside the EC2 — which
# bypasses Caddy entirely and presents as 127.0.0.1 to uvicorn. Public ingress
# to those endpoints stays blocked.
#
# Uses AWS Systems Manager (SSM) Session Manager instead of SSH so port 22
# does not need to be open in the security group.
#
# Called by deploy/terraform/license.tf's null_resource, but designed to be
# re-runnable stand-alone to renew or replace an existing license without a
# full `terraform apply`.

set -euo pipefail

INSTANCE_ID=""
AWS_REGION=""
TENANT_SLUG=""
CUSTOMER_NAME=""
DURATION_DAYS="7"
PRIVATE_KEY=""
WORK_DIR=""
WAIT_TIMEOUT_SECS="2400"  # 40 min — first-boot docker builds are slow.

usage() {
    cat <<EOF
Usage: $0 --instance-id <id> --region <region> --tenant-slug <slug> \\
          --customer-name <name> --duration-days <n> \\
          --private-key <path> --work-dir <dir>
EOF
    exit 64
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --instance-id)     INSTANCE_ID="$2"; shift 2 ;;
        --region)          AWS_REGION="$2"; shift 2 ;;
        --tenant-slug)     TENANT_SLUG="$2"; shift 2 ;;
        --customer-name)   CUSTOMER_NAME="$2"; shift 2 ;;
        --duration-days)   DURATION_DAYS="$2"; shift 2 ;;
        --private-key)     PRIVATE_KEY="$2"; shift 2 ;;
        --work-dir)        WORK_DIR="$2"; shift 2 ;;
        # Legacy SSH flags accepted but silently ignored for backwards compat.
        --host|--ssh-key|--ssh-user|--ssh-port) shift 2 ;;
        -h|--help)         usage ;;
        *)                 echo "unknown flag: $1" >&2; usage ;;
    esac
done

for required in INSTANCE_ID AWS_REGION TENANT_SLUG CUSTOMER_NAME PRIVATE_KEY WORK_DIR; do
    if [[ -z "${!required:-}" ]]; then
        echo "missing required flag: --${required,,}" | tr '_' '-' >&2
        usage
    fi
done

PRIVATE_KEY="${PRIVATE_KEY/#\~/$HOME}"
if [[ ! -f "$PRIVATE_KEY" ]]; then
    echo "FATAL: license private key not found at $PRIVATE_KEY" >&2
    exit 1
fi

mkdir -p "$WORK_DIR"
ACTIVATION_JSON="$WORK_DIR/activation-request.json"
LICENSE_JSON="$WORK_DIR/license.json"
STATUS_JSON="$WORK_DIR/license-status.json"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
LICENSE_TOOL="$REPO_ROOT/scripts/license_tool.py"
if [[ ! -f "$LICENSE_TOOL" ]]; then
    echo "FATAL: scripts/license_tool.py not found at $LICENSE_TOOL" >&2
    exit 1
fi

log() { echo "[issue_license $(date -u +%H:%M:%S)] $*"; }

# -----------------------------------------------------------------------------
# run_ssm <command_string>
# Sends a single-command SSM RunShellScript, waits for it to finish, prints
# stdout, and returns the exit status of the remote command (non-zero → fatal).
# -----------------------------------------------------------------------------
# PY is the local Python 3 interpreter used to sign the license (needs the
# `cryptography` lib) and to JSON/base64-encode payloads. Selecting it is
# fiddly for two reasons:
#   1. Terraform's local-exec runs with a different PATH than an interactive
#      shell, so a bare `python` may resolve to a system interpreter that lacks
#      `cryptography` (license_tool.py then fails with ModuleNotFoundError).
#   2. Windows ships a fake `python3` Store stub that prints an install nag and
#      produces no stdout.
# So we test each candidate by actually importing cryptography and printing the
# major version; the repo's backend venv (guaranteed to have the dep) is tried
# first via an absolute path so it's found regardless of CWD/PATH.
PY=""
for _cand in \
    "$REPO_ROOT/backend/venv/Scripts/python.exe" \
    "$REPO_ROOT/backend/venv/bin/python" \
    python3 python py; do
    if [[ "$("$_cand" -c 'import sys, cryptography; print(sys.version_info[0])' 2>/dev/null)" == "3" ]]; then
        PY="$_cand"
        break
    fi
done
if [[ -z "$PY" ]]; then
    echo "FATAL: no Python 3 with the 'cryptography' library found." >&2
    echo "       Tried the backend venv and python3/python/py on PATH." >&2
    echo "       Fix: pip install cryptography  (or set up backend/venv)." >&2
    exit 1
fi

run_ssm() {
    local cmd="$1"
    local cmd_id
    # JSON-encode the remote command via stdin so quoting survives intact.
    cmd_id=$(aws ssm send-command \
        --instance-ids "$INSTANCE_ID" \
        --region "$AWS_REGION" \
        --document-name "AWS-RunShellScript" \
        --parameters "{\"commands\":[$(printf '%s' "$cmd" | "$PY" -c 'import json,sys; print(json.dumps(sys.stdin.read()))')]}" \
        --query "Command.CommandId" --output text) || return 1

    # Poll for a terminal status. Extract the field with the AWS CLI's own
    # --query so we never depend on a local JSON parser in the hot loop.
    local status
    while true; do
        status=$(aws ssm get-command-invocation \
            --command-id "$cmd_id" \
            --instance-id "$INSTANCE_ID" \
            --region "$AWS_REGION" \
            --query "Status" --output text 2>/dev/null || echo "Pending")
        case "$status" in
            Success|Failed|Cancelled|TimedOut) break ;;
        esac
        sleep 5
    done

    local stdout stderr
    stdout=$(aws ssm get-command-invocation \
        --command-id "$cmd_id" --instance-id "$INSTANCE_ID" --region "$AWS_REGION" \
        --query "StandardOutputContent" --output text 2>/dev/null || true)
    stderr=$(aws ssm get-command-invocation \
        --command-id "$cmd_id" --instance-id "$INSTANCE_ID" --region "$AWS_REGION" \
        --query "StandardErrorContent" --output text 2>/dev/null || true)

    if [[ -n "$stdout" ]]; then printf '%s' "$stdout"; fi
    if [[ "$status" != "Success" ]]; then
        if [[ -n "$stderr" ]]; then echo "$stderr" >&2; fi
        echo "FATAL: SSM command failed with status $status" >&2
        return 1
    fi
}

# -----------------------------------------------------------------------------
# Wait for the backend container to be healthy.
# -----------------------------------------------------------------------------
log "Waiting for backend container on $INSTANCE_ID (timeout ${WAIT_TIMEOUT_SECS}s)"
deadline=$(( $(date +%s) + WAIT_TIMEOUT_SECS ))
while true; do
    if result=$(run_ssm "docker exec horalix_backend curl --silent --fail --max-time 5 http://127.0.0.1:8000/api/health" 2>/dev/null); then
        log "Backend responded healthy"
        break
    fi
    if (( $(date +%s) >= deadline )); then
        echo "FATAL: backend never came up within ${WAIT_TIMEOUT_SECS}s, instance $INSTANCE_ID" >&2
        exit 1
    fi
    log "Backend not ready yet, retrying in 30s..."
    sleep 30
done

# -----------------------------------------------------------------------------
# Phase 1 — pull the activation request (contains machine_fingerprint).
# -----------------------------------------------------------------------------
log "Reading activation request"
run_ssm "docker exec horalix_backend curl --silent --fail --max-time 10 http://127.0.0.1:8000/api/licensing/activation-request" \
    > "$ACTIVATION_JSON"

FINGERPRINT=$("$PY" -c "import json,sys; print(json.load(open(sys.argv[1]))['machine_fingerprint'])" "$ACTIVATION_JSON")
log "Fingerprint: $FINGERPRINT"

# -----------------------------------------------------------------------------
# Phase 2 — sign locally, base64-encode, ship via SSM, POST to import endpoint.
# -----------------------------------------------------------------------------
log "Signing ${DURATION_DAYS}-day license for \"$CUSTOMER_NAME\""
"$PY" "$LICENSE_TOOL" sign \
    --private-key "$PRIVATE_KEY" \
    --machine-fingerprint "$FINGERPRINT" \
    --customer-name "$CUSTOMER_NAME" \
    --duration-days "$DURATION_DAYS" \
    --output "$LICENSE_JSON" \
    --output-format api

# Encode the license JSON as base64 so it's safe to embed in a shell command.
LICENSE_B64=$("$PY" -c "
import base64, json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
print(base64.b64encode(json.dumps(d).encode()).decode())
" "$LICENSE_JSON")

log "Importing license"
IMPORT_CMD="echo '${LICENSE_B64}' | base64 -d > /tmp/horalix-license.json && docker cp /tmp/horalix-license.json horalix_backend:/tmp/horalix-license.json && docker exec horalix_backend curl --silent --fail --show-error --max-time 30 -X POST http://127.0.0.1:8000/api/licensing/import -H 'Content-Type: application/json' -d @/tmp/horalix-license.json && rm -f /tmp/horalix-license.json"
run_ssm "$IMPORT_CMD" > "$STATUS_JSON"

log "Status after import:"
cat "$STATUS_JSON"
echo
log "Done. License + status saved under $WORK_DIR"
