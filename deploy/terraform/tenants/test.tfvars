# Copy this file to tenants/<slug>.tfvars and fill in the values.
# Then: terraform workspace new <slug> && terraform apply -var-file=tenants/<slug>.tfvars

tenant_slug   = "test"
tenant_name   = "Test Hospital"
contact_email = "affankapidzic3@gmail.com"
trial_days    = 7

aws_region    = "eu-central-1"
instance_type = "g6.xlarge"
enable_gpu    = true   # GPU: 1x A10G 24GB VRAM. Echo models run on CUDA (cu126 torch) + vLLM report.

# Pin the AZ to dodge InsufficientInstanceCapacity. Leave "" to let AWS pick the
# first default subnet (eu-central-1a, the busiest AZ — often out of g5 capacity).
# subnet-0ea89878a5a8960bb = eu-central-1a
# subnet-01ccc60744714f1fe = eu-central-1b
# subnet-07fd884e43b3c0cad = eu-central-1c 
subnet_id = "subnet-0ea89878a5a8960bb"   # eu-central-1a

# Tenant subdomain attaches under this zone: <tenant_slug>.<route53_zone_name>
route53_zone_name = "echo.horalix.com"

# S3 locations for the release tree and AI model weights.
# Keep release_s3_uri pinned to a version directory so a docker rebuild on the
# EC2 picks up exactly the snapshot you intended.
release_s3_uri      = "s3://horalix-releases/v1.0.0/"
models_s3_uri       = ""
release_bucket_arns = ["arn:aws:s3:::horalix-releases"]

# Report-generation model served by vLLM (downloaded from HuggingFace into the
# data volume's HF cache on first start). AWQ-quantized so it fits alongside the
# echo models on the shared A10G.
reporting_model_id = "Qwen/Qwen2.5-14B-Instruct-AWQ"

# 40GB: the data volume holds Postgres, Orthanc DICOMs, licensing AND the vLLM
# HuggingFace cache (~9GB for the 14B AWQ report model). 20GB overflowed once the
# mount was fixed. Only applies to fresh deploys / a volume resize.
data_volume_size_gb = 40

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
