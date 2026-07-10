import os
from pathlib import Path

import pytest

from app.core import runtime_paths


def _source_asset_or_skip(model_key: str, asset_key: str) -> Path:
    """Resolve a checkpoint when source model assets are available.

    Checkpoints are intentionally not committed to the source repository. Release
    and packaging jobs set HORALIX_REQUIRE_MODEL_ASSETS=1, turning an absent asset
    into a test failure; ordinary source-only test runs report a clear skip.
    """
    try:
        path = runtime_paths.model_asset_path(model_key, asset_key)
    except FileNotFoundError as exc:
        if os.environ.get("HORALIX_REQUIRE_MODEL_ASSETS") == "1":
            pytest.fail(str(exc))
        pytest.skip(f"Source checkpoint unavailable: {exc}")

    if path.exists():
        return path
    if os.environ.get("HORALIX_REQUIRE_MODEL_ASSETS") == "1":
        pytest.fail(f"Required source checkpoint is missing: {path}")
    pytest.skip(f"Source checkpoint unavailable: {path}")


def test_source_secondary_analysis_encoder_resolves_real_source_filename():
    path = _source_asset_or_skip(
        "secondary_analysis",
        "encoder_checkpoint",
    )

    assert path.name == "echo_prime_encoder.pt"


def test_source_motion_segmentation_checkpoint_resolves_nested_source_path():
    path = _source_asset_or_skip(
        "motion_segmentation",
        "checkpoint",
    )

    assert path.name == "best.pt"
    assert "deeplabv3_resnet50_random" in str(path)


def test_source_primary_analysis_weights_resolve_real_source_filename():
    path = _source_asset_or_skip(
        "primary_analysis",
        "weights_checkpoint",
    )

    assert path.name == "panecho.pt"


def test_frozen_secondary_analysis_encoder_maps_to_packaged_alias(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setattr(runtime_paths, "is_frozen_runtime", lambda: True)
    monkeypatch.setattr(runtime_paths, "backend_root", lambda: tmp_path)

    path = runtime_paths.model_asset_path(
        "secondary_analysis",
        "encoder_checkpoint",
    )

    expected = (
        tmp_path
        / "runtime_assets"
        / "models"
        / "secondary_analysis"
        / "model_data"
        / "weights"
        / "analysis_encoder.pt"
    )
    assert path == expected


def test_ensure_model_assets_available_raises_with_missing_asset_details(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setattr(runtime_paths, "is_frozen_runtime", lambda: True)
    monkeypatch.setattr(runtime_paths, "backend_root", lambda: tmp_path)

    with pytest.raises(FileNotFoundError, match="encoder_checkpoint="):
        runtime_paths.ensure_model_assets_available(
            "secondary_analysis",
            ("encoder_checkpoint",),
        )
