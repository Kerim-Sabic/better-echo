#!/usr/bin/env bash
# Provision a new Horalix Echo trial environment for one hospital.
#
# Usage:
#   ./provision.sh <slug> "<hospital name>" <contact@example.com>
#
# Example:
#   ./provision.sh acme "Acme Hospital" it@acme-hospital.org
#
# This wrapper exists so the day-to-day operator workflow is one command per
# hospital request. It assumes you've already done the one-time setup:
#   - Configured AWS credentials (`aws sts get-caller-identity` works).
#   - Generated the license-signing keypair with:
#       python scripts/license_tool.py keygen \
#         --private-key-out ~/.horalix/license-private.pem \
#         --public-key-out  ~/.horalix/license-public.pem \
#         --public-key-b64-out ~/.horalix/license-public.b64
#   - Filled in deploy/terraform/tenants/<slug>.tfvars (copy from _template.tfvars).
#   - Synced the release tree to s3://horalix-releases/<version>/ to match
#     release_s3_uri in the tfvars.

set -euo pipefail

if [[ $# -lt 1 ]]; then
    cat <<EOF
Usage: $0 <slug> ["Hospital Name" <contact@example.com>]

  <slug>    DNS-safe identifier, e.g. "acme". Also Terraform workspace name.
  Optional name+email override the values in tenants/<slug>.tfvars.

The tfvars file must already exist at deploy/terraform/tenants/<slug>.tfvars.
Create it once from tenants/_template.tfvars.
EOF
    exit 64
fi

SLUG="$1"
NAME="${2:-}"
EMAIL="${3:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$REPO_ROOT/deploy/terraform"
TFVARS="$TF_DIR/tenants/$SLUG.tfvars"

if [[ ! -f "$TFVARS" ]]; then
    echo "FATAL: $TFVARS does not exist." >&2
    echo "Create it from $TF_DIR/tenants/_template.tfvars and fill in tenant-specific values." >&2
    exit 1
fi

# Per-tenant overrides if the user passed them on the command line.
OVERRIDES=()
if [[ -n "$NAME" ]]; then
    OVERRIDES+=(-var "tenant_name=$NAME")
fi
if [[ -n "$EMAIL" ]]; then
    OVERRIDES+=(-var "contact_email=$EMAIL")
fi

cd "$TF_DIR"

terraform init -input=false
if ! terraform workspace list | grep -qE "^\s*\*?\s*${SLUG}\s*$"; then
    terraform workspace new "$SLUG"
else
    terraform workspace select "$SLUG"
fi

terraform apply -input=false -auto-approve \
    -var-file="tenants/$SLUG.tfvars" \
    "${OVERRIDES[@]}"

echo
echo "================================================================"
echo " Trial server provisioned. Outputs:"
echo "================================================================"
terraform output
echo
echo "Next: email the tenant URL above to the hospital, along with the"
echo "generic client installer link. The 7-day license is already active."
