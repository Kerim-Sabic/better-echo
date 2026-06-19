###############################################################################
# Provider
###############################################################################

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project    = "horalix-echo-trial"
      Tenant     = var.tenant_slug
      ManagedBy  = "terraform"
      LicenseEnd = local.license_expires_at_label
    }
  }
}

###############################################################################
# Locals
###############################################################################

locals {
  name_prefix              = "horalix-${var.tenant_slug}"
  fqdn                     = "${var.tenant_slug}.${var.route53_zone_name}"
  ssh_private_key_filename = "${path.module}/.secrets/${var.tenant_slug}/ssh-key.pem"

  # Approximate expiry stamp for AWS resource tags (real expiry is enforced
  # by the signed license on the backend). Used purely for at-a-glance ops.
  license_expires_at_label = formatdate("YYYY-MM-DD", timeadd(plantimestamp(), "${var.trial_days * 24}h"))
}

###############################################################################
# Per-tenant SSH keypair
#
# Generated locally and persisted under .secrets/<slug>/ssh-key.pem so the
# operator can `ssh -i` into the box later. The key never lives in AWS; only
# its public counterpart is uploaded as an aws_key_pair.
###############################################################################

resource "tls_private_key" "tenant" {
  algorithm = "ED25519"
}

resource "local_sensitive_file" "ssh_private_key" {
  content         = tls_private_key.tenant.private_key_openssh
  filename        = local.ssh_private_key_filename
  file_permission = "0600"
}

resource "aws_key_pair" "tenant" {
  key_name   = "${local.name_prefix}-ssh"
  public_key = tls_private_key.tenant.public_key_openssh
}

###############################################################################
# Per-tenant secrets
###############################################################################

resource "random_password" "postgres" {
  length  = 40
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}
