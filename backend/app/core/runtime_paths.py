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

_SOURCE_MODEL_PROBES = {
    "primary_analysis": (
        ("hubconf.py",),
        ("content", "tasks.pkl"),
        ("src", "models.py"),
    ),
    "secondary_analysis": (
        ("model_data", "weights", "echo_prime_encoder.pt"),
        ("model_data", "weights", "view_classifier.pt"),
        ("assets", "MIL_weights.csv"),
    ),
    "motion_segmentation": (
        ("output", "segmentation", "deeplabv3_resnet50_random", "best.pt"),
    ),
    "study_measurements": (
        ("runner_2d.py",),
        ("runner_doppler.py",),
        ("weights",),
    ),
}

_MODEL_ASSET_LAYOUTS = {
    "primary_analysis": {
        "repo_root": {
            "source": (),
            "frozen": (),
        },
        "weights_checkpoint": {
            "source": ("weights", "panecho.pt"),
            "frozen": ("weights", "model.pt"),
        },
    },
    "secondary_analysis": {
        "repo_root": {
            "source": (),
            "frozen": (),
        },
        "encoder_checkpoint": {
            "source": ("model_data", "weights", "echo_prime_encoder.pt"),
            "frozen": ("model_data", "weights", "analysis_encoder.pt"),
        },
        "view_classifier_checkpoint": {
            "source": ("model_data", "weights", "view_classifier.pt"),
            "frozen": ("model_data", "weights", "view_classifier.pt"),
        },
    },
    "motion_segmentation": {
        "checkpoint": {
            "source": ("output", "segmentation", "deeplabv3_resnet50_random", "best.pt"),
            "frozen": ("best.pt",),
        },
    },
    "study_measurements": {
        "weights_root": {
            "source": ("weights",),
            "frozen": ("weights",),
        },
    },
}


def _source_model_assets_root() -> Path:
    return _SOURCE_APP_DIR / "AI_models"


def _source_model_dir(model_key: str) -> Path:
    root = _source_model_assets_root()
    probes = _SOURCE_MODEL_PROBES.get(model_key)
    if not probes:
        return root / model_key

    for candidate_dir in sorted(path for path in root.iterdir() if path.is_dir()):
        if all((candidate_dir / Path(*probe)).exists() for probe in probes):
            return candidate_dir

    raise FileNotFoundError(
        f"Could not resolve source runtime assets for model key '{model_key}' under {root}."
    )


def is_frozen_runtime() -> bool:
    return bool(getattr(sys, "frozen", False))


def _runtime_asset_variant() -> str:
    return "frozen" if is_frozen_runtime() else "source"


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
    return _source_model_assets_root()


def model_assets_dir(model_key: str) -> Path:
    if is_frozen_runtime():
        name = _FROZEN_MODEL_DIRS.get(model_key, model_key)
        return model_assets_root() / name
    return _source_model_dir(model_key)


def model_asset_path(model_key: str, asset_key: str) -> Path:
    layout = _MODEL_ASSET_LAYOUTS.get(model_key, {})
    asset_layout = layout.get(asset_key)
    if asset_layout is None:
        raise KeyError(f"Unknown asset '{asset_key}' for model key '{model_key}'.")

    relative_parts = asset_layout.get(_runtime_asset_variant())
    if relative_parts is None:
        raise KeyError(
            f"Model asset '{asset_key}' for model key '{model_key}' does not define the current runtime layout."
        )

    base_dir = model_assets_dir(model_key)
    return base_dir / Path(*relative_parts) if relative_parts else base_dir


def ensure_model_assets_available(model_key: str, asset_keys: tuple[str, ...] | list[str]) -> None:
    missing_paths: list[tuple[str, Path]] = []
    for asset_key in asset_keys:
        asset_path = model_asset_path(model_key, asset_key)
        if not asset_path.exists():
            missing_paths.append((asset_key, asset_path))

    if not missing_paths:
        return

    details = ", ".join(
        f"{asset_key}={asset_path}"
        for asset_key, asset_path in missing_paths
    )
    raise FileNotFoundError(
        f"Missing runtime assets for model key '{model_key}' in {_runtime_asset_variant()} mode: {details}"
    )
