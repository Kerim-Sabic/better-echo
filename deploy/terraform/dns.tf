###############################################################################
# Route53 — point ${tenant_slug}.${route53_zone_name} at the EC2 public IP.
#
# Caddy's HTTP-01 ACME challenge runs as soon as the stack boots, which means
# this record MUST resolve before docker compose finishes starting the caddy
# container. Provisioning waits for cert issuance in license.tf's
# null_resource, not here, but the dependency chain ensures the record is
# created the moment the EC2 has an IP.
###############################################################################

data "aws_route53_zone" "public" {
  name         = "${var.route53_zone_name}."
  private_zone = false
}

resource "aws_route53_record" "tenant" {
  zone_id = data.aws_route53_zone.public.zone_id
  name    = local.fqdn
  type    = "A"
  ttl     = 60
  records = [aws_instance.tenant.public_ip]
}
