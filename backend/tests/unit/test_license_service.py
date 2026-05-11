import base64
import json
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.core.config import settings
from app.services.licensing.service import (
    build_activation_request,
    get_license_file_path,
    get_license_status,
    import_signed_license,
    invalidate_license_status_cache,
    is_license_exempt_path,
    is_license_read_only_allowed_path,
)
from app.services.licensing import machine_identity
from app.services.licensing import service as licensing_service


def _iso_at(offset_days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=offset_days)).isoformat().replace("+00:00", "Z")


def _canonical_signature(payload: dict, private_key: Ed25519PrivateKey) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return base64.b64encode(private_key.sign(canonical)).decode("utf-8")


def _configure_license_env(monkeypatch, tmp_path):
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    public_key_b64 = base64.b64encode(
        public_key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
    ).decode("utf-8")

    monkeypatch.setattr(settings, "LICENSE_STORAGE_DIR", str(tmp_path), raising=False)
    monkeypatch.setattr(settings, "LICENSE_PUBLIC_KEY_B64", public_key_b64, raising=False)
    invalidate_license_status_cache()
    return private_key


def test_import_signed_license_accepts_matching_machine(monkeypatch, tmp_path):
    private_key = _configure_license_env(monkeypatch, tmp_path)
    activation_request = build_activation_request()
    payload = {
        "license_id": "pilot-001",
        "customer_name": "Test Hospital",
        "issued_at": _iso_at(0),
        "expires_at": _iso_at(30),
        "machine_fingerprint": activation_request["machine_fingerprint"],
        "features": ["core", "llm"],
    }

    status = import_signed_license(
        {
            "payload": payload,
            "signature": _canonical_signature(payload, private_key),
        }
    )

    assert status["valid"] is True
    assert status["status"] == "valid"
    assert status["customer_name"] == "Test Hospital"
    assert get_license_file_path().exists()


def test_activation_request_fingerprint_is_stable(monkeypatch, tmp_path):
    _configure_license_env(monkeypatch, tmp_path)

    first_request = build_activation_request()
    second_request = build_activation_request()

    assert first_request["machine_fingerprint"] == second_request["machine_fingerprint"]


def test_machine_fingerprint_ignores_hostname_and_network_inputs(monkeypatch, tmp_path):
    _configure_license_env(monkeypatch, tmp_path)
    original_fingerprint = build_activation_request()["machine_fingerprint"]

    monkeypatch.setattr(licensing_service.socket, "gethostname", lambda: "RENAMED-SERVER")
    monkeypatch.setattr(licensing_service.platform, "machine", lambda: "DIFFERENT-MACHINE")

    assert build_activation_request()["machine_fingerprint"] == original_fingerprint


def test_import_signed_license_replaces_existing_license_and_extends_expiry(monkeypatch, tmp_path):
    private_key = _configure_license_env(monkeypatch, tmp_path)
    activation_request = build_activation_request()

    first_payload = {
        "license_id": "pilot-short",
        "customer_name": "Test Hospital",
        "issued_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat().replace("+00:00", "Z"),
        "machine_fingerprint": activation_request["machine_fingerprint"],
        "features": ["core", "llm"],
    }
    second_payload = {
        "license_id": "pilot-renewed",
        "customer_name": "Test Hospital",
        "issued_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat().replace("+00:00", "Z"),
        "machine_fingerprint": activation_request["machine_fingerprint"],
        "features": ["core", "llm"],
    }

    first_status = import_signed_license(
        {
            "payload": first_payload,
            "signature": _canonical_signature(first_payload, private_key),
        }
    )
    second_status = import_signed_license(
        {
            "payload": second_payload,
            "signature": _canonical_signature(second_payload, private_key),
        }
    )

    assert first_status["valid"] is True
    assert second_status["valid"] is True
    assert second_status["license_id"] == "pilot-renewed"
    assert second_status["expires_at"] == second_payload["expires_at"]
    assert second_status["features"] == ["core", "llm"]


def test_import_signed_license_rejects_wrong_machine(monkeypatch, tmp_path):
    private_key = _configure_license_env(monkeypatch, tmp_path)
    payload = {
        "license_id": "pilot-002",
        "customer_name": "Wrong Machine Hospital",
        "issued_at": _iso_at(0),
        "expires_at": _iso_at(30),
        "machine_fingerprint": "wrong-machine",
        "features": ["core"],
    }

    with pytest.raises(ValueError, match="fingerprint"):
        import_signed_license(
            {
                "payload": payload,
                "signature": _canonical_signature(payload, private_key),
            }
        )


def test_get_license_status_reports_expired_license(monkeypatch, tmp_path):
    private_key = _configure_license_env(monkeypatch, tmp_path)
    activation_request = build_activation_request()
    payload = {
        "license_id": "pilot-expired",
        "customer_name": "Expired Hospital",
        "issued_at": _iso_at(-60),
        "expires_at": _iso_at(-1),
        "machine_fingerprint": activation_request["machine_fingerprint"],
        "features": ["core"],
    }
    envelope = {
        "payload": payload,
        "signature": _canonical_signature(payload, private_key),
    }
    license_path = get_license_file_path()
    license_path.parent.mkdir(parents=True, exist_ok=True)
    license_path.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
    invalidate_license_status_cache()

    status = get_license_status(force_reload=True)

    assert status["valid"] is False
    assert status["status"] == "expired"
    assert "expired" in (status["detail"] or "").lower()


def test_import_signed_license_reactivates_system_after_expired_license(monkeypatch, tmp_path):
    private_key = _configure_license_env(monkeypatch, tmp_path)
    activation_request = build_activation_request()

    expired_payload = {
        "license_id": "pilot-expired-old",
        "customer_name": "Expired Hospital",
        "issued_at": _iso_at(-60),
        "expires_at": _iso_at(-1),
        "machine_fingerprint": activation_request["machine_fingerprint"],
        "features": ["core", "llm"],
    }
    renewed_payload = {
        "license_id": "pilot-renewed-short",
        "customer_name": "Expired Hospital",
        "issued_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat().replace("+00:00", "Z"),
        "machine_fingerprint": activation_request["machine_fingerprint"],
        "features": ["core", "llm"],
    }

    license_path = get_license_file_path()
    license_path.parent.mkdir(parents=True, exist_ok=True)
    license_path.write_text(
        json.dumps(
            {
                "payload": expired_payload,
                "signature": _canonical_signature(expired_payload, private_key),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    invalidate_license_status_cache()

    expired_status = get_license_status(force_reload=True)
    renewed_status = import_signed_license(
        {
            "payload": renewed_payload,
            "signature": _canonical_signature(renewed_payload, private_key),
        }
    )

    assert expired_status["status"] == "expired"
    assert renewed_status["valid"] is True
    assert renewed_status["status"] == "valid"
    assert renewed_status["license_id"] == "pilot-renewed-short"


def test_get_license_status_expires_cached_valid_license_without_restart(monkeypatch, tmp_path):
    private_key = _configure_license_env(monkeypatch, tmp_path)
    activation_request = build_activation_request()
    base_time = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    expires_at = base_time + timedelta(minutes=5)

    payload = {
        "license_id": "pilot-cache-expiry",
        "customer_name": "Expiry Hospital",
        "issued_at": base_time.isoformat().replace("+00:00", "Z"),
        "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
        "machine_fingerprint": activation_request["machine_fingerprint"],
        "features": ["core"],
    }
    envelope = {
        "payload": payload,
        "signature": _canonical_signature(payload, private_key),
    }
    license_path = get_license_file_path()
    license_path.parent.mkdir(parents=True, exist_ok=True)
    license_path.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
    invalidate_license_status_cache()

    monkeypatch.setattr(licensing_service, "_now_utc", lambda: base_time)
    status_before_expiry = get_license_status(force_reload=True)
    assert status_before_expiry["valid"] is True
    assert status_before_expiry["status"] == "valid"

    monkeypatch.setattr(licensing_service, "_now_utc", lambda: expires_at + timedelta(seconds=1))
    status_after_expiry = get_license_status()

    assert status_after_expiry["valid"] is False
    assert status_after_expiry["status"] == "expired"
    assert "expired" in (status_after_expiry["detail"] or "").lower()


def test_license_clock_allows_small_backward_correction(monkeypatch, tmp_path):
    private_key = _configure_license_env(monkeypatch, tmp_path)
    activation_request = build_activation_request()
    base_time = datetime(2026, 1, 10, 12, 0, tzinfo=timezone.utc)
    payload = {
        "license_id": "pilot-clock-grace",
        "customer_name": "Clock Hospital",
        "issued_at": base_time.isoformat().replace("+00:00", "Z"),
        "expires_at": (base_time + timedelta(days=30)).isoformat().replace("+00:00", "Z"),
        "machine_fingerprint": activation_request["machine_fingerprint"],
        "features": ["core"],
    }
    envelope = {
        "payload": payload,
        "signature": _canonical_signature(payload, private_key),
    }
    license_path = get_license_file_path()
    license_path.parent.mkdir(parents=True, exist_ok=True)
    license_path.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
    invalidate_license_status_cache()

    monkeypatch.setattr(licensing_service, "_now_utc", lambda: base_time)
    assert get_license_status(force_reload=True)["status"] == "valid"

    monkeypatch.setattr(licensing_service, "_now_utc", lambda: base_time - timedelta(hours=23))
    status = get_license_status(force_reload=True)

    assert status["status"] == "valid"


def test_license_clock_rejects_large_rollback(monkeypatch, tmp_path):
    private_key = _configure_license_env(monkeypatch, tmp_path)
    activation_request = build_activation_request()
    base_time = datetime(2026, 1, 10, 12, 0, tzinfo=timezone.utc)
    payload = {
        "license_id": "pilot-clock-rollback",
        "customer_name": "Clock Hospital",
        "issued_at": base_time.isoformat().replace("+00:00", "Z"),
        "expires_at": (base_time + timedelta(days=30)).isoformat().replace("+00:00", "Z"),
        "machine_fingerprint": activation_request["machine_fingerprint"],
        "features": ["core"],
    }
    envelope = {
        "payload": payload,
        "signature": _canonical_signature(payload, private_key),
    }
    license_path = get_license_file_path()
    license_path.parent.mkdir(parents=True, exist_ok=True)
    license_path.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
    invalidate_license_status_cache()

    monkeypatch.setattr(licensing_service, "_now_utc", lambda: base_time)
    assert get_license_status(force_reload=True)["status"] == "valid"

    monkeypatch.setattr(licensing_service, "_now_utc", lambda: base_time - timedelta(hours=25))
    status = get_license_status(force_reload=True)

    assert status["status"] == "invalid"
    assert "clock rollback" in (status["detail"] or "").lower()


def test_license_clock_last_seen_only_moves_forward(monkeypatch, tmp_path):
    _configure_license_env(monkeypatch, tmp_path)
    base_time = datetime(2026, 1, 10, 12, 0, tzinfo=timezone.utc)
    later_time = base_time + timedelta(hours=1)

    machine_identity.assert_license_clock_not_rolled_back(base_time)
    machine_identity.assert_license_clock_not_rolled_back(base_time - timedelta(hours=1))
    assert machine_identity._load_clock_state()["last_seen_utc"] == base_time.isoformat().replace("+00:00", "Z")

    machine_identity.assert_license_clock_not_rolled_back(later_time)
    assert machine_identity._load_clock_state()["last_seen_utc"] == later_time.isoformat().replace("+00:00", "Z")


@pytest.mark.parametrize(
    ("path_value", "expected"),
    [
        ("/api/licensing/status", True),
        ("/api/licensing/import", True),
        ("/api/admin/bootstrap-user", True),
        ("/api/admin/setup-status", True),
        ("/api/login", True),
        ("/api/health", True),
        ("/api/studies", False),
    ],
)
def test_is_license_exempt_path(path_value, expected):
    assert is_license_exempt_path(path_value) is expected


@pytest.mark.parametrize(
    ("path_value", "method", "expected"),
    [
        ("/api/studies", "GET", True),
        ("/api/admin/users", "GET", True),
        ("/api/studies/study-123", "GET", True),
        ("/api/studies/study-123/instances", "GET", True),
        ("/api/studies/study-123/study-analysis-results", "GET", True),
        ("/api/studies/study-123/study-measurements-results", "GET", True),
        ("/api/studies/study-123/llm-report-results", "GET", True),
        ("/api/studies/study-123/study-analysis-results", "PATCH", False),
        ("/api/studies/study-123/study-analysis-overrides", "GET", False),
        ("/api/admin/users", "POST", False),
    ],
)
def test_is_license_read_only_allowed_path(path_value, method, expected):
    assert is_license_read_only_allowed_path(path_value, method) is expected
