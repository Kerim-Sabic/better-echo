###############################################################################
# Two-phase license issuance
#
# The license payload binds to a machine fingerprint that the backend only
# computes on first boot. We therefore can't pre-sign a license alongside the
# rest of `terraform apply` — we have to wait for the backend to be up, read
# the fingerprint via /api/licensing/activation-request, sign locally with the
# operator's Ed25519 private key, then POST it back via /api/licensing/import.
#
# This null_resource performs the dance via AWS SSM (no port 22 required).
# scripts/issue_license.sh contains the actual logic and is reusable
# stand-alone (operator can re-run it to refresh an expired license without a
# full terraform apply).
###############################################################################

resource "null_resource" "license_issuance" {
  depends_on = [
    aws_instance.tenant,
    aws_volume_attachment.data,
    aws_route53_record.tenant,
  ]

  triggers = {
    instance_id           = aws_instance.tenant.id
    fqdn                  = local.fqdn
    trial_days            = var.trial_days
    private_key_signature = filemd5(var.license_private_key_path)
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOC
      "${path.module}/scripts/issue_license.sh" \
        --instance-id "${aws_instance.tenant.id}" \
        --region "${var.aws_region}" \
        --tenant-slug "${var.tenant_slug}" \
        --customer-name "${var.tenant_name}" \
        --duration-days "${var.trial_days}" \
        --private-key "${var.license_private_key_path}" \
        --work-dir "${path.module}/.secrets/${var.tenant_slug}"
    EOC
  }
}
