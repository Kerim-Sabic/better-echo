import os
from typing import Any, Dict, Mapping, Optional, Tuple

"""
In-memory pending state for WebAuthn ceremonies.

These states store the server-generated challenge and are required to complete
register/auth flows. In dev mode (single-process uvicorn) this is fine; in a
multi-worker deployment you'd replace this with a shared store (e.g. Redis).
"""

pending_register: Dict[int, Any] = {}
pending_auth: Dict[str, Tuple[Any, Optional[int]]] = {}


def _parse_gunicorn_workers(raw_args: str) -> Optional[int]:
    """Extract worker count from GUNICORN_CMD_ARGS when present."""
    tokens = raw_args.split()
    for idx, token in enumerate(tokens):
        if token in ("--workers", "-w") and idx + 1 < len(tokens):
            try:
                return int(tokens[idx + 1])
            except ValueError:
                return None
        if token.startswith("--workers="):
            try:
                return int(token.split("=", 1)[1])
            except ValueError:
                return None
    return None


def get_configured_worker_count(env: Optional[Mapping[str, str]] = None) -> int:
    """Resolve configured backend worker count from common runtime env vars."""
    env_map = env or os.environ
    for key in ("WEB_CONCURRENCY", "UVICORN_WORKERS"):
        raw = (env_map.get(key) or "").strip()
        if not raw:
            continue
        try:
            return int(raw)
        except ValueError:
            continue

    gunicorn_workers = _parse_gunicorn_workers((env_map.get("GUNICORN_CMD_ARGS") or "").strip())
    if gunicorn_workers is not None:
        return gunicorn_workers

    return 1


def assert_webauthn_state_runtime_safe(
    *,
    state_backend: str,
    require_single_process: bool,
    env: Optional[Mapping[str, str]] = None,
) -> None:
    """
    Enforce safe runtime expectations for WebAuthn ceremony pending state storage.

    With in-memory state, a multi-worker backend can break start/complete flows
    because pending challenges are process-local.
    """
    backend = (state_backend or "").strip().lower()
    if backend != "memory":
        return
    if not require_single_process:
        return

    worker_count = get_configured_worker_count(env)
    if worker_count > 1:
        raise RuntimeError(
            "Invalid WebAuthn runtime: WEBAUTHN_STATE_BACKEND=memory requires a single "
            f"backend process, but configured worker count is {worker_count}."
        )
