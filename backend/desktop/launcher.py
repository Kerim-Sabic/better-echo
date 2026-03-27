#!/usr/bin/env python3
import os
import sys
import types
import uvicorn

FROZEN_TORCH_DYNAMO_PACKAGE = "torch._dynamo"
FROZEN_TORCH_DYNAMO_UTILS_MODULE = "torch._dynamo.utils"


def is_frozen_runtime() -> bool:
    return bool(getattr(sys, 'frozen', False))


def _identity_decorator(fn=None, *_args, **_kwargs):
    """Return a no-op decorator compatible with torch._dynamo helpers."""
    if fn is None:
        def decorator(inner):
            return inner
        return decorator
    return fn


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


def install_frozen_torchvision_import_guard() -> None:
    """Keep packaged torchvision/timm on the native eager path in frozen mode."""
    if not is_frozen_runtime():
        return

    if (
        FROZEN_TORCH_DYNAMO_PACKAGE in sys.modules
        or FROZEN_TORCH_DYNAMO_UTILS_MODULE in sys.modules
    ):
        return

    stub_utils = types.ModuleType(FROZEN_TORCH_DYNAMO_UTILS_MODULE)
    stub_utils.is_compile_supported = lambda *_args, **_kwargs: False

    stub_package = types.ModuleType(FROZEN_TORCH_DYNAMO_PACKAGE)
    stub_package.__path__ = []
    stub_package.utils = stub_utils
    stub_package.disable = _identity_decorator
    stub_package.allow_in_graph = _identity_decorator
    stub_package.assume_constant_result = _identity_decorator
    stub_package.substitute_in_graph = lambda *_args, **_kwargs: _identity_decorator
    stub_package.list_backends = lambda *_args, **_kwargs: []
    stub_package.reset = lambda *_args, **_kwargs: None

    sys.modules[FROZEN_TORCH_DYNAMO_PACKAGE] = stub_package
    sys.modules[FROZEN_TORCH_DYNAMO_UTILS_MODULE] = stub_utils


def configure_frozen_matplotlib_backend() -> None:
    """Force a headless backend for packaged inference imports."""
    if not is_frozen_runtime():
        return

    os.environ.setdefault("MPLBACKEND", "Agg")


def configure_backend_runtime() -> None:
    backend_root = resolve_backend_root()
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)

    if is_frozen_runtime():
        os.chdir(backend_root)
        configure_frozen_matplotlib_backend()
        install_frozen_torchvision_import_guard()

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
