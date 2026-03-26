#!/usr/bin/env python3
import os
import sys
import uvicorn


def is_frozen_runtime() -> bool:
    return bool(getattr(sys, 'frozen', False))


def resolve_backend_root() -> str:
    if is_frozen_runtime():
        exe_dir = os.path.dirname(sys.executable)
        return os.path.abspath(os.path.join(exe_dir, '..', '..'))

    launcher_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(launcher_dir, '..'))


def resolve_backend_host() -> str:
    configured_host = os.environ.get("BACKEND_HOST")
    if configured_host and configured_host.strip():
        return configured_host.strip()

    if is_frozen_runtime():
        return "0.0.0.0"

    return "127.0.0.1"


def resolve_backend_port() -> int:
    raw_port = os.environ.get("BACKEND_PORT") or os.environ.get("PORT") or "8000"

    try:
        port = int(raw_port)
    except ValueError as exc:
        raise ValueError(f"Invalid backend port: {raw_port}") from exc

    if port <= 0 or port > 65535:
        raise ValueError(f"Invalid backend port: {raw_port}")

    return port


def configure_backend_runtime() -> None:
    backend_root = resolve_backend_root()
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)

    if is_frozen_runtime():
        os.chdir(backend_root)

if __name__ == "__main__":
    configure_backend_runtime()
    from app.main import app as fastapi_app

    uvicorn.run(
        fastapi_app,
        host=resolve_backend_host(),
        port=resolve_backend_port(),
        log_level="info",
        access_log=True,
    )
