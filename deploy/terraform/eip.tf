###############################################################################
# Elastic IP — a static public IP that stays attached across stop/start, so the
# Route53 record never goes stale. Free while the instance runs; ~$0.005/hr only
# while it's stopped.
###############################################################################

resource "aws_eip" "tenant" {
  domain   = "vpc"
  instance = aws_instance.tenant.id

  tags = {
    Name = "${local.name_prefix}-eip"
  }
}
