###############################################################################
# VPC / subnet — use defaults when not explicitly provided
###############################################################################

data "aws_vpc" "selected" {
  count   = var.vpc_id == "" ? 1 : 0
  default = true
}

data "aws_subnets" "selected" {
  count = var.subnet_id == "" ? 1 : 0

  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.selected[0].id]
  }
}

locals {
  vpc_id    = var.vpc_id != "" ? var.vpc_id : data.aws_vpc.selected[0].id
  subnet_id = var.subnet_id != "" ? var.subnet_id : data.aws_subnets.selected[0].ids[0]
}

###############################################################################
# Security group
#
# - 80 / 443 from the public internet for Caddy + Let's Encrypt HTTP-01.
# - 22 from operator CIDRs only. If operator_cidrs is empty SSH is denied;
#   in that case provisioning must use AWS SSM Session Manager (not wired up
#   in v1 — provide operator_cidrs).
# - All egress allowed (ECR pulls, S3 sync, Let's Encrypt, HuggingFace).
###############################################################################

resource "aws_security_group" "tenant" {
  name        = "${local.name_prefix}-sg"
  description = "Public web and restricted SSH for the ${var.tenant_slug} trial server."
  vpc_id      = local.vpc_id

  ingress {
    description = "HTTP - Lets Encrypt HTTP-01 challenge"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS - Caddy reverse proxy to backend and viewer"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = length(var.operator_cidrs) > 0 ? [1] : []
    content {
      description = "SSH from operator CIDRs"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = var.operator_cidrs
    }
  }

  egress {
    description = "All egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
