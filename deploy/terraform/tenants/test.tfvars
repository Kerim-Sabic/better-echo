# Copy this file to tenants/<slug>.tfvars and fill in the values.
# Then: terraform workspace new <slug> && terraform apply -var-file=tenants/<slug>.tfvars

tenant_slug   = "test"
tenant_name   = "Test Hospital"
contact_email = "affankapidzic3@gmail.com"
trial_days    = 7

aws_region    = "eu-central-1"
instance_type = "g5.xlarge"
enable_gpu    = true   # GPU: 1x A10G 24GB VRAM. Echo models run on CUDA (cu126 torch) + vLLM report.

# Tenant subdomain attaches under this zone: <tenant_slug>.<route53_zone_name>
route53_zone_name = "echo.horalix.com"

# S3 locations for the release tree and AI model weights.
# Keep release_s3_uri pinned to a version directory so a docker rebuild on the
# EC2 picks up exactly the snapshot you intended.
release_s3_uri      = "s3://horalix-releases/v1.0.0/"
models_s3_uri       = ""
release_bucket_arns = ["arn:aws:s3:::horalix-releases"]

data_volume_size_gb = 20

# Operator office / VPN CIDRs allowed to SSH in. Leave empty to disable SSH
# entirely (use AWS Session Manager via the SSM role instead).
operator_cidrs = []

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
license_public_key_b64 = "yoqxpZD+8qnGqfzfI3dEqpusYCSaMNaS0jZqezzeo4g="
