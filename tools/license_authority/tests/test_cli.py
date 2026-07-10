import base64
from datetime import UTC, datetime, timedelta

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from tools.license_authority.cli import canonicalize, issue_license


def test_issue_license_creates_a_machine_bound_envelope():
    private_key = Ed25519PrivateKey.generate()
    expires_at = datetime.now(UTC) + timedelta(days=30)

    envelope = issue_license(
        private_key=private_key,
        activation_request={"machine_fingerprint": "a" * 64},
        customer_name="Test Hospital",
        expires_at=expires_at,
        features=["core", "core", "llm"],
        license_id="license-1",
        now=datetime(2026, 1, 1, tzinfo=UTC),
    )

    payload = envelope["payload"]
    assert payload["license_id"] == "license-1"
    assert payload["machine_fingerprint"] == "a" * 64
    assert payload["features"] == ["core", "llm"]
    assert envelope["signature"]
    private_key.public_key().verify(
        base64.b64decode(envelope["signature"]),
        canonicalize(payload),
    )
