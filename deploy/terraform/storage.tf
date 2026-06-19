###############################################################################
# Persistent data volume for /var/lib/horalix
#
# Holds:
#   - postgres-data/    (Postgres on-disk state)
#   - orthanc-data/     (DICOM blob store)
#   - licensing/        (machine_identity.json — the fingerprint MUST persist
#                        across container restarts, otherwise the signed
#                        license stops verifying)
#   - models/           (AI weights synced from S3)
#   - caddy/            (Let's Encrypt cert cache)
#
# Kept separate from the root EBS so the instance can be re-imaged without
# invalidating the license fingerprint.
###############################################################################

resource "aws_ebs_volume" "data" {
  availability_zone = aws_instance.tenant.availability_zone
  size              = var.data_volume_size_gb
  type              = "gp3"
  encrypted         = true

  tags = {
    Name = "${local.name_prefix}-data"
  }
}

resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdh"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.tenant.id

  # Detach cleanly on destroy; mountpoint is unmounted by /etc/fstab's nofail.
  stop_instance_before_detaching = true
}
