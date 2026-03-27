from __future__ import annotations

import argparse
import base64
import json
import uuid
from calendar import monthrange
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Offline Horalix license key generation/signing tool for /api/licensing/import."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    keygen_parser = subparsers.add_parser("keygen", help="Generate a new Ed25519 keypair.")
    keygen_parser.add_argument("--private-key-out", required=True, help="PEM private key output path.")
    keygen_parser.add_argument("--public-key-out", required=True, help="PEM public key output path.")
    keygen_parser.add_argument(
        "--public-key-b64-out",
        help="Optional text output path for LICENSE_PUBLIC_KEY_B64.",
    )

    sign_parser = subparsers.add_parser("sign", help="Create a signed license import payload.")
    sign_parser.add_argument("--private-key", required=True, help="PEM private key path.")
    sign_parser.add_argument(
        "--activation-request",
        help="Activation request JSON exported from /api/licensing/activation-request.",
    )
    sign_parser.add_argument(
        "--machine-fingerprint",
        help="Machine fingerprint override if no activation request file is used.",
    )
    sign_parser.add_argument("--customer-name", required=True, help="Customer/site name.")
    sign_parser.add_argument(
        "--license-id",
        help="Optional license id. Defaults to a generated UUID-based value.",
    )
    sign_parser.add_argument(
        "--feature",
        action="append",
        dest="features",
        help="Feature flag to include. Repeat for multiple features. Defaults to core + llm.",
    )
    duration_group = sign_parser.add_mutually_exclusive_group(required=True)
    duration_group.add_argument("--expires-at", help="Explicit expiry timestamp in ISO 8601 UTC.")
    duration_group.add_argument("--duration-minutes", type=int, help="License duration in minutes.")
    duration_group.add_argument("--duration-days", type=int, help="License duration in days.")
    duration_group.add_argument("--duration-months", type=int, help="License duration in calendar months.")
    sign_parser.add_argument(
        "--issued-at",
        help="Optional issue timestamp in ISO 8601 UTC. Defaults to now.",
    )
    sign_parser.add_argument(
        "--output",
        help="Output path for signed JSON. Prints to stdout when omitted.",
    )
    sign_parser.add_argument(
        "--output-format",
        choices=("api", "storage"),
        default="api",
        help="api = /api/licensing/import request body, storage = backend on-disk envelope.",
    )

    return parser.parse_args()


def command_keygen(args: argparse.Namespace) -> int:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    private_key_path = Path(args.private_key_out)
    public_key_path = Path(args.public_key_out)
    public_key_b64_path = Path(args.public_key_b64_out) if args.public_key_b64_out else None

    private_key_path.parent.mkdir(parents=True, exist_ok=True)
    public_key_path.parent.mkdir(parents=True, exist_ok=True)
    if public_key_b64_path:
        public_key_b64_path.parent.mkdir(parents=True, exist_ok=True)

    private_key_path.write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    public_key_path.write_bytes(
        public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )

    public_key_b64 = base64.b64encode(
        public_key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
    ).decode("utf-8")

    if public_key_b64_path:
        public_key_b64_path.write_text(public_key_b64, encoding="utf-8")

    print(f"Private key: {private_key_path}")
    print(f"Public key:  {public_key_path}")
    print(f"LICENSE_PUBLIC_KEY_B64={public_key_b64}")
    return 0


def command_sign(args: argparse.Namespace) -> int:
    machine_fingerprint = resolve_machine_fingerprint(
        activation_request_path=args.activation_request,
        machine_fingerprint=args.machine_fingerprint,
    )
    issued_at = parse_iso_utc(args.issued_at) if args.issued_at else datetime.now(UTC)
    expires_at = resolve_expires_at(args, issued_at)
    license_id = args.license_id or f"license-{uuid.uuid4().hex[:12]}"
    features = args.features or ["core", "llm"]

    payload = {
        "license_id": license_id,
        "customer_name": args.customer_name,
        "issued_at": to_iso_utc(issued_at),
        "expires_at": to_iso_utc(expires_at),
        "machine_fingerprint": machine_fingerprint,
        "features": features,
    }

    private_key = load_private_key(Path(args.private_key))
    signature = base64.b64encode(private_key.sign(canonicalize_payload(payload))).decode("utf-8")
    if args.output_format == "storage":
        envelope = {
            "payload": payload,
            "signature": signature,
        }
    else:
        envelope = {
            "license": payload,
            "signature": signature,
        }

    rendered = json.dumps(envelope, indent=2, sort_keys=True)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(rendered, encoding="utf-8")
        output_label = "storage envelope" if args.output_format == "storage" else "import payload"
        print(f"Signed license {output_label} written to: {output_path}")
    else:
        print(rendered)

    return 0


def resolve_machine_fingerprint(
    *,
    activation_request_path: str | None,
    machine_fingerprint: str | None,
) -> str:
    if activation_request_path:
        payload = json.loads(Path(activation_request_path).read_text(encoding="utf-8"))
        resolved = str(payload.get("machine_fingerprint") or "").strip()
        if resolved:
            return resolved
        raise ValueError("Activation request is missing machine_fingerprint.")

    resolved = str(machine_fingerprint or "").strip()
    if resolved:
        return resolved

    raise ValueError("Provide either --activation-request or --machine-fingerprint.")


def resolve_expires_at(args: argparse.Namespace, issued_at: datetime) -> datetime:
    if args.expires_at:
        return parse_iso_utc(args.expires_at)
    if args.duration_minutes is not None:
        return issued_at + timedelta(minutes=args.duration_minutes)
    if args.duration_days is not None:
        return issued_at + timedelta(days=args.duration_days)
    if args.duration_months is not None:
        return add_calendar_months(issued_at, args.duration_months)
    raise ValueError("One expiry input is required.")


def parse_iso_utc(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def to_iso_utc(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def add_calendar_months(value: datetime, months: int) -> datetime:
    if months < 0:
        raise ValueError("duration-months must be >= 0")

    month_index = (value.month - 1) + months
    year = value.year + month_index // 12
    month = (month_index % 12) + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def canonicalize_payload(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def load_private_key(private_key_path: Path) -> Ed25519PrivateKey:
    private_key = serialization.load_pem_private_key(
        private_key_path.read_bytes(),
        password=None,
    )
    if not isinstance(private_key, Ed25519PrivateKey):
        raise ValueError("Private key must be an Ed25519 PEM key.")
    return private_key


def main() -> int:
    args = parse_args()
    if args.command == "keygen":
        return command_keygen(args)
    if args.command == "sign":
        return command_sign(args)
    raise ValueError(f"Unsupported command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
