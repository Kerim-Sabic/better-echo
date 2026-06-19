output "tenant_url" {
  description = "Public HTTPS URL the doctor pastes into the client app's setup wizard."
  value       = "https://${local.fqdn}"
}

output "tenant_fqdn" {
  description = "Fully-qualified domain name pointing at this tenant's EC2."
  value       = local.fqdn
}

output "ec2_public_ip" {
  description = "Public IPv4 of the tenant EC2. Useful for direct SSH if DNS hasn't propagated yet."
  value       = aws_instance.tenant.public_ip
}

output "ssh_command" {
  description = "Copy-pasteable SSH command for operator access."
  value       = "ssh -i ${local.ssh_private_key_filename} ubuntu@${aws_instance.tenant.public_ip}"
}

output "ssh_private_key_path" {
  description = "Filesystem path to the generated per-tenant SSH private key."
  value       = local.ssh_private_key_filename
}

output "trial_expires_at" {
  description = "Approximate expiry timestamp (the signed license has the authoritative value)."
  value       = local.license_expires_at_label
}
