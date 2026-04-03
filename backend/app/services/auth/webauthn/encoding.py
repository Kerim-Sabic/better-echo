import base64
from collections.abc import Mapping
from enum import Enum


def b64url(data: bytes) -> str:
    """Encode bytes as base64url without padding (WebAuthn JSON style)."""
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def b64url_to_bytes(data: str) -> bytes:
    """Decode base64url (with optional missing padding) into bytes."""
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def serialize_options(options) -> dict:
    """Convert FIDO2 publicKey options into a JSON-safe dict for the frontend."""
    data = getattr(options, "public_key", None) or options

    def enc(val):
        if isinstance(val, Enum):
            return val.value
        if isinstance(val, (bytes, bytearray, memoryview)):
            return b64url(bytes(val))
        if isinstance(val, list):
            return [enc(v) for v in val]
        if isinstance(val, Mapping):
            return {k: enc(v) for k, v in val.items()}
        return val

    return enc(data)
