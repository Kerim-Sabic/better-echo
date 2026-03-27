import importlib.util
from pathlib import Path
import sys
import types

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


def test_install_frozen_torchvision_import_guard_noops_in_source_mode(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: False)
    monkeypatch.delitem(sys.modules, launcher.FROZEN_TORCH_DYNAMO_PACKAGE, raising=False)
    monkeypatch.delitem(sys.modules, launcher.FROZEN_TORCH_DYNAMO_UTILS_MODULE, raising=False)

    launcher.install_frozen_torchvision_import_guard()

    assert launcher.FROZEN_TORCH_DYNAMO_PACKAGE not in sys.modules
    assert launcher.FROZEN_TORCH_DYNAMO_UTILS_MODULE not in sys.modules


def test_install_frozen_torchvision_import_guard_registers_stub_in_frozen_mode(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: True)
    monkeypatch.delitem(sys.modules, launcher.FROZEN_TORCH_DYNAMO_PACKAGE, raising=False)
    monkeypatch.delitem(sys.modules, launcher.FROZEN_TORCH_DYNAMO_UTILS_MODULE, raising=False)

    launcher.install_frozen_torchvision_import_guard()

    stub_package = sys.modules[launcher.FROZEN_TORCH_DYNAMO_PACKAGE]
    stub_utils = sys.modules[launcher.FROZEN_TORCH_DYNAMO_UTILS_MODULE]
    assert stub_package.utils is stub_utils
    assert stub_utils.is_compile_supported("cpu") is False
    assert stub_package.disable(lambda: "ok")() == "ok"
    decorated = stub_package.disable()(lambda: "decorated")
    assert decorated() == "decorated"
    assert stub_package.allow_in_graph(lambda: "graph")() == "graph"
    assert stub_package.assume_constant_result(lambda: "const")() == "const"
    assert stub_package.substitute_in_graph("unused")(lambda: "sub")() == "sub"
    assert stub_package.list_backends() == []
    assert stub_package.reset() is None


def test_install_frozen_torchvision_import_guard_preserves_existing_module(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: True)
    existing_module = types.ModuleType(launcher.FROZEN_TORCH_DYNAMO_UTILS_MODULE)
    monkeypatch.setitem(sys.modules, launcher.FROZEN_TORCH_DYNAMO_UTILS_MODULE, existing_module)
    monkeypatch.delitem(sys.modules, launcher.FROZEN_TORCH_DYNAMO_PACKAGE, raising=False)

    launcher.install_frozen_torchvision_import_guard()

    assert sys.modules[launcher.FROZEN_TORCH_DYNAMO_UTILS_MODULE] is existing_module


def test_configure_frozen_matplotlib_backend_sets_agg(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: True)
    monkeypatch.delenv("MPLBACKEND", raising=False)

    launcher.configure_frozen_matplotlib_backend()

    assert launcher.os.environ["MPLBACKEND"] == "Agg"


def test_configure_frozen_matplotlib_backend_noops_in_source_mode(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: False)
    monkeypatch.delenv("MPLBACKEND", raising=False)

    launcher.configure_frozen_matplotlib_backend()

    assert "MPLBACKEND" not in launcher.os.environ


def test_configure_packaged_license_policy_noops_in_source_mode(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: False)
    monkeypatch.setenv("LICENSE_ENFORCEMENT", "false")
    monkeypatch.setenv("LICENSE_PUBLIC_KEY_B64", "env-key")

    launcher.configure_packaged_license_policy()

    assert launcher.os.environ["LICENSE_ENFORCEMENT"] == "false"
    assert launcher.os.environ["LICENSE_PUBLIC_KEY_B64"] == "env-key"


def test_configure_packaged_license_policy_sets_embedded_release_values(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: True)
    monkeypatch.setattr(launcher, "RELEASE_CONFIG_IMPORT_ERROR", None)
    monkeypatch.setattr(launcher, "PACKAGED_LICENSE_ENFORCEMENT", True)
    monkeypatch.setattr(launcher, "PACKAGED_LICENSE_PUBLIC_KEY_B64", "embedded-key")
    monkeypatch.setenv("LICENSE_ENFORCEMENT", "false")
    monkeypatch.setenv("LICENSE_PUBLIC_KEY_B64", "env-key")

    launcher.configure_packaged_license_policy()

    assert launcher.os.environ["LICENSE_ENFORCEMENT"] == "true"
    assert launcher.os.environ["LICENSE_PUBLIC_KEY_B64"] == "embedded-key"


def test_configure_packaged_license_policy_rejects_missing_embedded_key(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: True)
    monkeypatch.setattr(launcher, "RELEASE_CONFIG_IMPORT_ERROR", None)
    monkeypatch.setattr(launcher, "PACKAGED_LICENSE_ENFORCEMENT", True)
    monkeypatch.setattr(launcher, "PACKAGED_LICENSE_PUBLIC_KEY_B64", "")

    with pytest.raises(RuntimeError, match="embedded license verification key"):
        launcher.configure_packaged_license_policy()


def test_configure_packaged_license_policy_rejects_missing_release_config(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: True)
    monkeypatch.setattr(launcher, "RELEASE_CONFIG_IMPORT_ERROR", ImportError("missing"))

    with pytest.raises(RuntimeError, match="embedded release config metadata"):
        launcher.configure_packaged_license_policy()


def test_configure_packaged_license_policy_rejects_disabled_embedded_policy(monkeypatch):
    launcher = _load_launcher_module()
    monkeypatch.setattr(launcher, "is_frozen_runtime", lambda: True)
    monkeypatch.setattr(launcher, "RELEASE_CONFIG_IMPORT_ERROR", None)
    monkeypatch.setattr(launcher, "PACKAGED_LICENSE_ENFORCEMENT", False)
    monkeypatch.setattr(launcher, "PACKAGED_LICENSE_PUBLIC_KEY_B64", "embedded-key")

    with pytest.raises(RuntimeError, match="mandatory embedded license enforcement"):
        launcher.configure_packaged_license_policy()
