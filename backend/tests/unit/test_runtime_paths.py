from pathlib import Path

import pytest

from app.core import runtime_paths


def test_source_secondary_analysis_encoder_resolves_real_source_filename():
    path = runtime_paths.model_asset_path(
        "secondary_analysis",
        "encoder_checkpoint",
    )

    assert path.name == "echo_prime_encoder.pt"
    assert path.exists()


def test_source_motion_segmentation_checkpoint_resolves_nested_source_path():
    path = runtime_paths.model_asset_path(
        "motion_segmentation",
        "checkpoint",
    )

    assert path.name == "best.pt"
    assert "deeplabv3_resnet50_random" in str(path)
    assert path.exists()


def test_source_primary_analysis_weights_resolve_real_source_filename():
    path = runtime_paths.model_asset_path(
        "primary_analysis",
        "weights_checkpoint",
    )

    assert path.name == "panecho.pt"
    assert path.exists()


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
