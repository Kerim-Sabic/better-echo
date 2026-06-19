###############################################################################
# Tenant identity
###############################################################################

variable "tenant_slug" {
  description = "DNS-safe identifier used as the subdomain and resource-name prefix (e.g. \"acme\")."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$", var.tenant_slug))
    error_message = "tenant_slug must be 3-32 chars, lowercase letters/digits/hyphens, and cannot start or end with a hyphen."
  }
}

variable "tenant_name" {
  description = "Human-readable customer name baked into the license payload."
  type        = string
}

variable "contact_email" {
  description = "Operator email used as the Let's Encrypt ACME contact and on the license."
  type        = string
}

variable "trial_days" {
  description = "License validity window in days. Backend flips to read-only after this elapses."
  type        = number
  default     = 7
}

###############################################################################
# AWS / networking
###############################################################################

variable "aws_region" {
  description = "AWS region for the tenant EC2 + EBS + DNS resources."
  type        = string
  default     = "eu-central-1"
}

variable "instance_type" {
  description = "EC2 instance type. g5.xlarge = 1x A10G 24GB VRAM. t3.medium = CPU-only (no LLM)."
  type        = string
  default     = "g5.xlarge"
}

variable "enable_gpu" {
  description = "Set true for GPU instances (g5 family). False skips NVIDIA toolkit and LLM container."
  type        = bool
  default     = false
}

variable "data_volume_size_gb" {
  description = "Size of the EBS data volume mounted at /var/lib/horalix."
  type        = number
  default     = 200
}

variable "vpc_id" {
  description = "VPC to launch the EC2 into. Empty string = use the region's default VPC."
  type        = string
  default     = ""
}

variable "subnet_id" {
  description = "Subnet to launch the EC2 into. Empty string = pick the first default-VPC subnet."
  type        = string
  default     = ""
}

variable "operator_cidrs" {
  description = "CIDRs allowed to SSH (port 22) into the tenant EC2. Restrict to operator office / VPN."
  type        = list(string)
  default     = []
}

###############################################################################
# DNS
###############################################################################

variable "route53_zone_name" {
  description = "Public Route53 zone we attach the tenant subdomain to (e.g. \"echo.horalix.com\"). No trailing dot."
  type        = string
}

###############################################################################
# Release artifacts (S3)
###############################################################################

variable "release_s3_uri" {
  description = "s3:// URI of the versioned release snapshot synced to the EC2 (mirrors the repo subset needed for the cloud build)."
  type        = string
}

variable "models_s3_uri" {
  description = "s3:// URI of the AI model weights synced to /var/lib/horalix/models. Empty string skips sync."
  type        = string
  default     = ""
}

variable "release_bucket_arns" {
  description = "S3 bucket ARNs the EC2 IAM role gets read access to (release + models bucket)."
  type        = list(string)
}

###############################################################################
# Licensing
###############################################################################

variable "license_private_key_path" {
  description = "Local filesystem path to the Ed25519 PEM private key used to sign licenses. Lives on the operator's machine, NEVER uploaded to AWS."
  type        = string
}

variable "license_public_key_b64" {
  description = "Base64-encoded raw Ed25519 public key matching license_private_key_path. Set on the backend as LICENSE_PUBLIC_KEY_B64."
  type        = string
  sensitive   = true
}

###############################################################################
# Backend / app config
###############################################################################

variable "reporting_model_id" {
  description = "Model identifier passed to vLLM (matches REPORTING_MODEL_ID in the cloud .env)."
  type        = string
  default     = "local-reporting-model"
}

variable "token_expire_hours" {
  description = "JWT auth token lifetime."
  type        = number
  default     = 12
}
