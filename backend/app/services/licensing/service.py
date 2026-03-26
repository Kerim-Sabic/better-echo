import base64
import hashlib
import json
import logging
import platform
import socket
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from platformdirs import user_data_dir

from app.core.config import settings
from app.services.licensing.signing import canonicalize_license_payload

logger = logging.getLogger(__name__)

LICENSE_FILE_NAME = "license.json"
LICENSE_STATUS_VALID = "valid"
LICENSE_STATUS_MISSING = "missing"
LICENSE_STATUS_INVALID = "invalid"
LICENSE_STATUS_EXPIRED = "expired"

_cached_status: Optional[dict[str, Any]] = None
_cached_token: Optional[tuple[Optional[float], Optional[str]]] = None


def get_license_storage_dir() -> Path:
    configured_dir = (settings.LICENSE_STORAGE_DIR or "").strip()
    if configured_dir:
        return Path(configured_dir).expanduser().resolve()

    return Path(user_data_dir("Horalix Echo", "Horalix")) / "licensing"


def get_license_file_path() -> Path:
    return get_license_storage_dir() / LICENSE_FILE_NAME


def invalidate_license_status_cache() -> None:
    global _cached_status, _cached_token
    _cached_status = None
    _cached_token = None


def is_license_exempt_path(path: str) -> bool:
    exempt_prefixes = (
        "/api/health",
        "/api/licensing",
        "/api/admin/bootstrap-user",
        "/api/admin/setup-status",
        "/api/login",
        "/api/logout",
        "/api/check-auth",
        "/api/webauthn",
        "/docs",
        "/redoc",
        "/openapi.json",
    )
    return any(path.startswith(prefix) for prefix in exempt_prefixes)


def build_activation_request() -> dict[str, Any]:
    return {
        "generated_at": _utcnow_iso(),
        "machine_fingerprint": get_machine_fingerprint(),
        "hostname": socket.gethostname(),
        "platform": platform.system(),
        "platform_release": platform.release(),
        "machine": platform.machine(),
    }


def import_signed_license(envelope: dict[str, Any]) -> dict[str, Any]:
    _verify_license_envelope(envelope)

    license_path = get_license_file_path()
    license_path.parent.mkdir(parents=True, exist_ok=True)
    license_path.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
    invalidate_license_status_cache()
    return get_license_status(force_reload=True)


def get_license_status(*, force_reload: bool = False) -> dict[str, Any]:
    global _cached_status, _cached_token

    license_path = get_license_file_path()
    file_mtime = license_path.stat().st_mtime if license_path.exists() else None
    cache_token = (file_mtime, settings.LICENSE_PUBLIC_KEY_B64)

    if not force_reload and _cached_status is not None and _cached_token == cache_token:
        return dict(_cached_status)

    status = _load_license_status(license_path)
    _cached_status = status
    _cached_token = cache_token
    return dict(status)


def log_current_license_status() -> None:
    status = get_license_status(force_reload=True)
    if status["valid"]:
        logger.info(
            "License status: valid (customer=%s, expires_at=%s)",
            status.get("customer_name") or "unknown",
            status.get("expires_at") or "unknown",
        )
        return

    logger.warning(
        "License status: %s (%s)",
        status.get("status"),
        status.get("detail") or "no detail",
    )


def get_machine_fingerprint() -> str:
    source = "|".join(
        [
            socket.gethostname(),
            platform.system(),
            platform.machine(),
            str(uuid.getnode()),
        ]
    )
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _load_license_status(license_path: Path) -> dict[str, Any]:
    if not license_path.exists():
        return _build_status(
            status=LICENSE_STATUS_MISSING,
            valid=False,
            detail="No signed license has been imported.",
        )

    try:
        envelope = json.loads(license_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return _build_status(
            status=LICENSE_STATUS_INVALID,
            valid=False,
            detail=f"License file could not be read: {exc}",
        )

    try:
        payload = _verify_license_envelope(envelope)
    except ValueError as exc:
        detail = str(exc)
        status_name = LICENSE_STATUS_EXPIRED if "expired" in detail.lower() else LICENSE_STATUS_INVALID
        return _build_status(
            status=status_name,
            valid=False,
            detail=detail,
            payload=(envelope or {}).get("payload"),
        )

    return _build_status(
        status=LICENSE_STATUS_VALID,
        valid=True,
        detail=None,
        payload=payload,
    )


def _verify_license_envelope(envelope: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(envelope, dict):
        raise ValueError("License envelope must be a JSON object.")

    payload = envelope.get("payload")
    signature_b64 = envelope.get("signature")

    if not isinstance(payload, dict):
        raise ValueError("License envelope is missing a valid payload object.")
    if not isinstance(signature_b64, str) or not signature_b64.strip():
        raise ValueError("License envelope is missing a signature.")

    public_key = _load_public_key()
    if public_key is None:
        raise ValueError("LICENSE_PUBLIC_KEY_B64 is not configured.")

    try:
        signature = base64.b64decode(signature_b64)
    except Exception as exc:
        raise ValueError(f"License signature is not valid base64: {exc}") from exc

    try:
        public_key.verify(signature, canonicalize_license_payload(payload))
    except InvalidSignature as exc:
        raise ValueError("License signature verification failed.") from exc

    if payload.get("machine_fingerprint") != get_machine_fingerprint():
        raise ValueError("License machine fingerprint does not match this server.")

    expires_at = _parse_iso8601(payload.get("expires_at"))
    if expires_at is None:
        raise ValueError("License payload is missing a valid expires_at value.")
    if expires_at <= datetime.now(timezone.utc):
        raise ValueError("License has expired.")

    return payload


def _load_public_key() -> Optional[Ed25519PublicKey]:
    raw_value = (settings.LICENSE_PUBLIC_KEY_B64 or "").strip()
    if not raw_value:
        return None

    try:
        key_bytes = base64.b64decode(raw_value)
        return Ed25519PublicKey.from_public_bytes(key_bytes)
    except ValueError:
        pem_bytes = raw_value.encode("utf-8")
        loaded_key = serialization.load_pem_public_key(pem_bytes)
        if not isinstance(loaded_key, Ed25519PublicKey):
            raise ValueError("License public key must be an Ed25519 key.")
        return loaded_key

def _parse_iso8601(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _build_status(
    *,
    status: str,
    valid: bool,
    detail: Optional[str],
    payload: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    payload = payload or {}
    return {
        "status": status,
        "valid": valid,
        "detail": detail,
        "license_id": payload.get("license_id"),
        "customer_name": payload.get("customer_name"),
        "expires_at": payload.get("expires_at"),
        "features": list(payload.get("features") or []),
    }


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
