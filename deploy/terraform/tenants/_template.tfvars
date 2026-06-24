# Copy this file to tenants/<slug>.tfvars and fill in the values.
# Then: terraform workspace new <slug> && terraform apply -var-file=tenants/<slug>.tfvars

tenant_slug   = "acme"
tenant_name   = "Acme Hospital"
contact_email = "ops@horalix.com"
trial_days    = 7

aws_region    = "eu-central-1"
instance_type = "g5.xlarge"
enable_gpu    = true   # set false + instance_type = "t3.medium" for CPU-only (no LLM)

# Tenant subdomain attaches under this zone: <tenant_slug>.<route53_zone_name>
route53_zone_name = "echo.horalix.com"

# S3 locations for the release tree and AI model weights.
# Keep release_s3_uri pinned to a version directory so a docker rebuild on the
# EC2 picks up exactly the snapshot you intended.
release_s3_uri      = "s3://horalix-releases/v1.0.0/"
models_s3_uri       = "s3://horalix-models/v1.0.0/"
release_bucket_arns = [
  "arn:aws:s3:::horalix-releases",
  "arn:aws:s3:::horalix-models",
]

# Operator office / VPN CIDRs allowed to SSH in. Leave empty to disable SSH
# entirely (use AWS Session Manager via the SSM role instead).
operator_cidrs = [
  # "203.0.113.7/32",
]

# Path to the Ed25519 private key that signs licenses. Stays on the operator's
# machine; never uploaded to AWS. Generate once with:
#   python scripts/license_tool.py keygen \
#     --private-key-out ~/.horalix/license-private.pem \
#     --public-key-out  ~/.horalix/license-public.pem \
#     --public-key-b64-out ~/.horalix/license-public.b64
license_private_key_path = "~/.horalix/license-private.pem"

# Base64-encoded raw Ed25519 public key (the output of --public-key-b64-out
# above). Must match license_private_key_path; the backend uses this to
# verify the signature on /api/licensing/import.
license_public_key_b64 = "REPLACE_ME_BASE64_PUBLIC_KEY"
