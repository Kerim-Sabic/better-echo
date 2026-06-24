import base64
import hashlib
import json
import os
import platform
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from app.core.config import settings


IDENTITY_FILE_NAME = "machine_identity.json"
CLOCK_STATE_FILE_NAME = "license_clock_state.json"
FINGERPRINT_DOMAIN = b"horalix-license|"
CLOCK_ROLLBACK_GRACE = timedelta(hours=24)


class MachineIdentityError(ValueError):
    pass


class ClockRollbackError(ValueError):
    pass


def get_machine_identity_dir() -> Path:
    configured_dir = (settings.LICENSE_STORAGE_DIR or "").strip()
    if configured_dir:
        return Path(configured_dir).expanduser().resolve()

    program_data = os.environ.get("PROGRAMDATA")
    if platform.system() == "Windows" and program_data:
        return Path(program_data) / "Horalix" / "Licensing"

    return Path.home() / ".horalix" / "licensing"


def get_stable_machine_fingerprint() -> str:
    secret = _load_or_create_machine_secret()
    return hashlib.sha256(FINGERPRINT_DOMAIN + secret).hexdigest()


def assert_license_clock_not_rolled_back(now_utc: datetime) -> None:
    now_utc = _normalize_utc(now_utc)
    state = _load_clock_state()
    last_seen = _parse_iso8601(state.get("last_seen_utc"))

    if last_seen and now_utc + CLOCK_ROLLBACK_GRACE < last_seen:
        raise ClockRollbackError("System clock rollback detected. Please correct the server time.")

    if last_seen is None or now_utc > last_seen:
        try:
            _store_clock_state({"last_seen_utc": _to_utc_iso(now_utc)})
        except OSError as exc:
            raise ClockRollbackError(
                "License clock state could not be saved. Please check server licensing folder permissions."
            ) from exc


def _load_or_create_machine_secret() -> bytes:
    path = get_machine_identity_dir() / IDENTITY_FILE_NAME
    if not path.exists():
        secret = secrets.token_bytes(32)
        try:
            _store_machine_secret(secret)
        except OSError as exc:
            raise MachineIdentityError(
                "Machine identity could not be created. Please check server licensing folder permissions."
            ) from exc
        return secret

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return _unprotect_bytes(payload["secret"])
    except Exception as exc:
        raise MachineIdentityError(
            "Machine identity could not be read. Export a new activation request after support resets licensing identity."
        ) from exc


def _store_machine_secret(secret: bytes) -> None:
    path = get_machine_identity_dir() / IDENTITY_FILE_NAME
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "schema": "horalix-machine-identity-v1",
                "secret": _protect_bytes(secret),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    _tighten_secret_file_mode(path)


def _load_clock_state() -> dict[str, Any]:
    path = get_machine_identity_dir() / CLOCK_STATE_FILE_NAME
    if not path.exists():
        return {}

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        state = json.loads(_unprotect_bytes(payload["state"]).decode("utf-8"))
        return state if isinstance(state, dict) else {}
    except Exception as exc:
        raise ClockRollbackError("License clock state could not be read. Please contact support.") from exc


def _store_clock_state(state: dict[str, Any]) -> None:
    path = get_machine_identity_dir() / CLOCK_STATE_FILE_NAME
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "schema": "horalix-license-clock-v1",
                "state": _protect_bytes(json.dumps(state, sort_keys=True).encode("utf-8")),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    _tighten_secret_file_mode(path)


def _tighten_secret_file_mode(path: Path) -> None:
    # On Windows the file is DPAPI-protected and ACLs already restrict access.
    # On POSIX (cloud trial EC2, on-prem Linux dev) the secret is stored in the
    # plain-dev scheme, so the only thing standing between it and a non-root
    # process on the same host is the filesystem mode. AWS EBS at-rest
    # encryption + single-tenant EC2 + 0600 is the deployment's intended
    # threat model — see deploy/cloud/docker-compose.cloud.yml.
    if platform.system() == "Windows":
        return
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _protect_bytes(value: bytes) -> dict[str, str]:
    # Two protection schemes are written, one per OS family:
    #
    # - "dpapi-local-machine" on Windows. DPAPI ties the ciphertext to the
    #   local SYSTEM key, defeating other Windows accounts on the same machine
    #   from reading the secret even if they can read the file.
    #
    # - "plain-dev" on POSIX. Originally a dev-only fallback, this is also the
    #   intended path for the AWS cloud trial deployment: each tenant runs in
    #   an isolated EC2 with EBS at-rest encryption, the file is chmodded to
    #   0600 (see _tighten_secret_file_mode), and the licensing dir is bind-
    #   mounted from the persistent EBS volume so the fingerprint survives
    #   container restarts.
    if platform.system() == "Windows":
        try:
            import win32crypt
        except ImportError as exc:
            raise MachineIdentityError("Windows DPAPI is unavailable in this runtime.") from exc

        flags = getattr(win32crypt, "CRYPTPROTECT_LOCAL_MACHINE", 0x4)
        protected = win32crypt.CryptProtectData(value, None, None, None, None, flags)
        return {
            "scheme": "dpapi-local-machine",
            "value": base64.b64encode(protected).decode("ascii"),
        }

    return {
        "scheme": "plain-dev",
        "value": base64.b64encode(value).decode("ascii"),
    }


def _unprotect_bytes(payload: dict[str, str]) -> bytes:
    scheme = payload.get("scheme")
    value = base64.b64decode(payload.get("value") or "")

    if scheme == "dpapi-local-machine":
        try:
            import win32crypt
        except ImportError as exc:
            raise MachineIdentityError("Windows DPAPI is unavailable in this runtime.") from exc
        return win32crypt.CryptUnprotectData(value, None, None, None, 0)[1]

    if scheme == "plain-dev" and platform.system() != "Windows":
        return value

    raise MachineIdentityError("Unsupported machine identity protection scheme.")


def _normalize_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _to_utc_iso(value: datetime) -> str:
    return _normalize_utc(value).isoformat().replace("+00:00", "Z")


def _parse_iso8601(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value.strip():
        return None

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None

    return _normalize_utc(parsed)
