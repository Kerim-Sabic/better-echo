###############################################################################
# AMIs
#
# GPU instances: AWS Deep Learning Base AMI (Ubuntu 22.04) — ships with NVIDIA
#   drivers pre-installed; bootstrap.sh only adds the Container Toolkit.
# CPU instances: Canonical Ubuntu 22.04 LTS — lighter, cheaper, no GPU deps.
###############################################################################

data "aws_ami" "gpu_base" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["Deep Learning Base OSS Nvidia Driver GPU AMI (Ubuntu 22.04) *"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

###############################################################################
# IAM role — read access to the release + models S3 buckets
###############################################################################

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "tenant" {
  name               = "${local.name_prefix}-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

data "aws_iam_policy_document" "s3_read" {
  statement {
    sid     = "ListReleaseBuckets"
    actions = ["s3:ListBucket"]
    resources = var.release_bucket_arns
  }

  statement {
    sid     = "ReadReleaseObjects"
    actions = ["s3:GetObject"]
    resources = [
      for arn in var.release_bucket_arns : "${arn}/*"
    ]
  }
}

resource "aws_iam_role_policy" "s3_read" {
  name   = "${local.name_prefix}-s3-read"
  role   = aws_iam_role.tenant.id
  policy = data.aws_iam_policy_document.s3_read.json
}

# Allow Systems Manager Session Manager fallback if SSH is locked down.
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.tenant.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "tenant" {
  name = "${local.name_prefix}-profile"
  role = aws_iam_role.tenant.name
}

###############################################################################
# EC2 instance
#
# Note on EBS device naming: NVMe-backed nitro instances (g5, m6i, etc.) expose
# the secondary EBS volume as /dev/nvme1n1 inside the OS, regardless of the
# device_name attribute. EBS_DEVICE in bootstrap.sh hardcodes that path; if a
# future instance family uses a different naming convention this needs revisiting.
###############################################################################

resource "aws_instance" "tenant" {
  ami                         = var.enable_gpu ? data.aws_ami.gpu_base.id : data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = local.subnet_id
  vpc_security_group_ids      = [aws_security_group.tenant.id]
  key_name                    = aws_key_pair.tenant.key_name
  iam_instance_profile        = aws_iam_instance_profile.tenant.name
  associate_public_ip_address = true

  root_block_device {
    volume_type = "gp3"
    # 150GB: the Docker image store lives here. GPU builds use CUDA torch wheels
    # (~2.5GB larger than CPU) on top of the 7.3GB model weights, and a rebuild
    # transiently holds the old + new image + build cache. 100GB overflowed.
    volume_size = 150
    encrypted   = true
  }

  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    domain                 = local.fqdn
    acme_email             = var.contact_email
    postgres_password      = random_password.postgres.result
    secret_key             = random_password.jwt_secret.result
    license_public_key_b64 = var.license_public_key_b64
    release_s3_uri         = var.release_s3_uri
    models_s3_uri          = var.models_s3_uri
    reporting_model_id     = var.reporting_model_id
    token_expire_hours     = var.token_expire_hours
    aws_region             = var.aws_region
    enable_gpu             = var.enable_gpu
  })

  # Re-run user_data if its rendered contents change. Without this, edits to
  # the template silently fall on the floor on `terraform apply`.
  user_data_replace_on_change = true

  tags = {
    Name = local.name_prefix
  }

  lifecycle {
    # `data.aws_ami.ubuntu` uses most_recent=true, so its ID changes whenever
    # Canonical publishes a new image. Since `ami` forces replacement, an
    # unrelated `terraform apply` (e.g. one that only refreshes the DNS record
    # after a stop/start) would otherwise destroy and rebuild the whole tenant.
    # Pin the AMI to whatever the instance first launched with; brand-new
    # tenants still get the latest image on their initial apply.
    ignore_changes = [ami]
  }
}
