import importlib.util
from pathlib import Path

import pytest


def _load_launcher_module():
    launcher_path = (
        Path(__file__).resolve().parents[2] / "desktop" / "launcher.py"
    )
    spec = importlib.util.spec_from_file_location("backend_desktop_launcher", launcher_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_resolve_backend_host_defaults_to_localhost_in_source_mode(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.delenv("BACKEND_HOST", raising=False)
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: False)

    assert launcher.resolve_backend_host() == "127.0.0.1"


def test_resolve_backend_host_defaults_to_lan_bind_in_frozen_mode(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.delenv("BACKEND_HOST", raising=False)
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: True)

    assert launcher.resolve_backend_host() == "0.0.0.0"


def test_resolve_backend_port_prefers_backend_port(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setenv("BACKEND_PORT", "8123")
    monkeypatch.setenv("PORT", "9000")

    assert launcher.resolve_backend_port() == 8123


def test_resolve_backend_port_rejects_invalid_value(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setenv("BACKEND_PORT", "invalid")

    with pytest.raises(ValueError, match="Invalid backend port"):
        launcher.resolve_backend_port()
