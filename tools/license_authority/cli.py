"""Create Horalix Ed25519 keys and machine-bound signed license envelopes."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


FINGERPRINT_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def canonicalize(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def parse_utc(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("expires-at must be an ISO-8601 timestamp, for example 2027-01-31T00:00:00Z") from exc
    if parsed.tzinfo is None:
        raise ValueError("expires-at must include a UTC offset or Z suffix")
    return parsed.astimezone(UTC)


def utc_iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def load_activation_request(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not read activation request: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError("Activation request must be a JSON object")
    fingerprint = value.get("machine_fingerprint")
    if not isinstance(fingerprint, str) or not FINGERPRINT_PATTERN.fullmatch(fingerprint):
        raise ValueError("Activation request has an invalid machine_fingerprint")
    return value


def load_private_key(path: Path) -> Ed25519PrivateKey:
    try:
        loaded_key = serialization.load_pem_private_key(path.read_bytes(), password=None)
    except (OSError, ValueError, TypeError) as exc:
        raise ValueError(f"Could not load Ed25519 private key: {exc}") from exc
    if not isinstance(loaded_key, Ed25519PrivateKey):
        raise ValueError("Private key must be an Ed25519 PEM key")
    return loaded_key


def write_private_file(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def generate_keypair(private_key_path: Path, public_key_path: Path) -> None:
    if private_key_path.exists() or public_key_path.exists():
        raise ValueError("Refusing to overwrite an existing key file")
    private_key = Ed25519PrivateKey.generate()
    write_private_file(
        private_key_path,
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ),
    )
    public_key_path.parent.mkdir(parents=True, exist_ok=True)
    public_key_path.write_bytes(
        private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )


def issue_license(
    *,
    private_key: Ed25519PrivateKey,
    activation_request: dict[str, Any],
    customer_name: str,
    expires_at: datetime,
    features: list[str],
    license_id: str | None,
    now: datetime | None = None,
) -> dict[str, Any]:
    normalized_name = customer_name.strip()
    if not normalized_name:
        raise ValueError("customer-name is required")
    now_utc = (now or datetime.now(UTC)).astimezone(UTC)
    if expires_at <= now_utc:
        raise ValueError("expires-at must be in the future")

    payload = {
        "license_id": license_id or uuid.uuid4().hex,
        "customer_name": normalized_name,
        "issued_at": utc_iso(now_utc),
        "expires_at": utc_iso(expires_at),
        "machine_fingerprint": activation_request["machine_fingerprint"],
        "features": list(dict.fromkeys(feature.strip() for feature in features if feature.strip())),
    }
    return {
        "payload": payload,
        "signature": base64.b64encode(private_key.sign(canonicalize(payload))).decode("ascii"),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Offline Horalix license-authority tool")
    commands = parser.add_subparsers(dest="command", required=True)

    keygen = commands.add_parser("generate-keypair", help="Create a new Ed25519 signing keypair")
    keygen.add_argument("--private-key-out", type=Path, required=True)
    keygen.add_argument("--public-key-out", type=Path, required=True)

    issue = commands.add_parser("issue", help="Sign a machine-bound license envelope")
    issue.add_argument("--private-key", type=Path, required=True)
    issue.add_argument("--activation-request", type=Path, required=True)
    issue.add_argument("--customer-name", required=True)
    issue.add_argument("--expires-at", required=True)
    issue.add_argument("--feature", action="append", default=[])
    issue.add_argument("--license-id")
    issue.add_argument("--output", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "generate-keypair":
            generate_keypair(args.private_key_out, args.public_key_out)
            print(f"Created private key: {args.private_key_out}")
            print(f"Created public key: {args.public_key_out}")
            return 0

        envelope = issue_license(
            private_key=load_private_key(args.private_key),
            activation_request=load_activation_request(args.activation_request),
            customer_name=args.customer_name,
            expires_at=parse_utc(args.expires_at),
            features=args.feature,
            license_id=args.license_id,
        )
        if args.output.exists():
            raise ValueError("Refusing to overwrite an existing license file")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(envelope, indent=2) + "\n", encoding="utf-8")
        print(f"Created signed license: {args.output}")
        return 0
    except ValueError as exc:
        print(f"Error: {exc}")
        return 2
