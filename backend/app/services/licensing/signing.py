import base64
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Optional, Sequence

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey


def canonicalize_license_payload(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def encode_public_key_b64(public_key: Ed25519PublicKey) -> str:
    raw_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return base64.b64encode(raw_bytes).decode("utf-8")


def serialize_private_key_pem(private_key: Ed25519PrivateKey) -> bytes:
    return private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


def serialize_public_key_pem(public_key: Ed25519PublicKey) -> bytes:
    return public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )


def build_license_payload(
    *,
    customer_name: str,
    machine_fingerprint: str,
    expires_at: datetime,
    features: Optional[Sequence[str]] = None,
    issued_at: Optional[datetime] = None,
    license_id: Optional[str] = None,
) -> dict[str, Any]:
    issued_at_value = (issued_at or datetime.now(UTC)).astimezone(UTC)
    expires_at_value = expires_at.astimezone(UTC)
    return {
        "license_id": license_id or uuid.uuid4().hex,
        "customer_name": customer_name,
        "issued_at": _to_utc_iso(issued_at_value),
        "expires_at": _to_utc_iso(expires_at_value),
        "machine_fingerprint": machine_fingerprint,
        "features": list(features or []),
    }


def build_signed_license_envelope(
    *,
    payload: dict[str, Any],
    private_key: Ed25519PrivateKey,
) -> dict[str, Any]:
    signature = private_key.sign(canonicalize_license_payload(payload))
    return {
        "payload": payload,
        "signature": base64.b64encode(signature).decode("utf-8"),
    }


def expires_at_after_minutes(minutes: int, *, now: Optional[datetime] = None) -> datetime:
    return (now or datetime.now(UTC)).astimezone(UTC) + timedelta(minutes=minutes)


def expires_at_after_days(days: int, *, now: Optional[datetime] = None) -> datetime:
    return (now or datetime.now(UTC)).astimezone(UTC) + timedelta(days=days)


def _to_utc_iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
