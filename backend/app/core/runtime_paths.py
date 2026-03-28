from __future__ import annotations

import os
import sys
from pathlib import Path


_SOURCE_BACKEND_DIR = Path(__file__).resolve().parents[2]
_SOURCE_APP_DIR = _SOURCE_BACKEND_DIR / "app"

_FROZEN_MODEL_DIRS = {
    "primary_analysis": "primary_analysis",
    "secondary_analysis": "secondary_analysis",
    "motion_segmentation": "motion_segmentation",
    "study_measurements": "study_measurements",
}

_SOURCE_MODEL_DIRS = {
    "primary_analysis": "PanEcho",
    "secondary_analysis": "EchoPrime",
    "motion_segmentation": "EchonetDynamic",
    "study_measurements": "measurements",
}


def is_frozen_runtime() -> bool:
    return bool(getattr(sys, "frozen", False))


def backend_root() -> Path:
    if is_frozen_runtime():
        configured = os.environ.get("HORALIX_BACKEND_ROOT")
        if configured:
            return Path(configured).resolve()
        return Path(sys.executable).resolve().parents[2]
    return _SOURCE_BACKEND_DIR


def internal_runtime_root() -> Path:
    if is_frozen_runtime():
        configured = os.environ.get("HORALIX_PYI_INTERNAL_DIR")
        if configured:
            return Path(configured).resolve()
        return Path(sys.executable).resolve().parent / "_internal"
    return _SOURCE_APP_DIR


def uploads_dir() -> Path:
    if is_frozen_runtime():
        path = backend_root() / "uploads"
    else:
        path = _SOURCE_APP_DIR / "uploads"
    path.mkdir(parents=True, exist_ok=True)
    return path


def cache_root() -> Path:
    if is_frozen_runtime():
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            path = Path(local_app_data) / "Horalix Pulse Server" / "cache"
        else:
            path = Path.home() / ".horalix-pulse-server" / "cache"
    else:
        path = _SOURCE_BACKEND_DIR / ".cache"
    path.mkdir(parents=True, exist_ok=True)
    return path


def cache_dir(name: str) -> Path:
    path = cache_root() / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def logs_dir() -> Path:
    if is_frozen_runtime():
        path = cache_dir("logs")
    else:
        path = _SOURCE_APP_DIR / "logs"
        path.mkdir(parents=True, exist_ok=True)
    return path


def config_dir() -> Path:
    if is_frozen_runtime():
        return internal_runtime_root() / "app" / "configs"
    return _SOURCE_APP_DIR / "configs"


def prompting_dir() -> Path:
    if is_frozen_runtime():
        return internal_runtime_root() / "app" / "prompting"
    return _SOURCE_APP_DIR / "prompting"


def config_path(filename: str) -> Path:
    return config_dir() / filename


def prompt_template_path(filename: str) -> Path:
    return prompting_dir() / filename


def model_assets_root() -> Path:
    if is_frozen_runtime():
        return backend_root() / "runtime_assets" / "models"
    return _SOURCE_APP_DIR / "AI_models"


def model_assets_dir(model_key: str) -> Path:
    if is_frozen_runtime():
        name = _FROZEN_MODEL_DIRS.get(model_key, model_key)
        return model_assets_root() / name
    name = _SOURCE_MODEL_DIRS.get(model_key, model_key)
    return model_assets_root() / name
