"""
Parity tests for the reworked EchoPrime ultrasound-sector masking.

The optimization computes the sector mask once and applies it only to the
sampled frames (instead of copying + masking the whole cine). These tests pin
the new split functions against a verbatim copy of the ORIGINAL
``mask_outside_ultrasound`` implementation to prove the outputs are identical.
"""

import cv2
import importlib
import json
import numpy as np
import pytest
import torch


# --- Verbatim copy of the original implementation (pre-optimization) ---------
def _original_mask_outside_ultrasound(original_pixels):
    try:
        testarray = np.copy(original_pixels)
        vid = np.copy(original_pixels)
        frame_sum = testarray[0].astype(np.float32)
        frame_sum = cv2.cvtColor(frame_sum, cv2.COLOR_YUV2RGB)
        frame_sum = cv2.cvtColor(frame_sum, cv2.COLOR_RGB2GRAY)
        frame_sum = np.where(frame_sum > 0, 1, 0)
        frames = testarray.shape[0]
        for i in range(frames):
            frame = testarray[i, :, :, :].astype(np.uint8)
            frame = cv2.cvtColor(frame, cv2.COLOR_YUV2RGB)
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
            frame = np.where(frame > 0, 1, 0)
            frame_sum = np.add(frame_sum, frame)

        kernel = np.ones((3, 3), np.uint8)
        frame_sum = cv2.erode(np.uint8(frame_sum), kernel, iterations=10)
        frame_sum = np.where(frame_sum > 0, 1, 0)

        frame0 = testarray[0].astype(np.uint8)
        frame0 = cv2.cvtColor(frame0, cv2.COLOR_YUV2RGB)
        frame0 = cv2.cvtColor(frame0, cv2.COLOR_RGB2GRAY)
        frame_last = testarray[testarray.shape[0] - 1].astype(np.uint8)
        frame_last = cv2.cvtColor(frame_last, cv2.COLOR_YUV2RGB)
        frame_last = cv2.cvtColor(frame_last, cv2.COLOR_RGB2GRAY)
        frame_diff = abs(np.subtract(frame0, frame_last))
        frame_diff = np.where(frame_diff > 0, 1, 0)
        frame_diff[0:20, 0:20] = np.zeros([20, 20])

        frame_overlap = np.add(frame_sum, frame_diff)
        frame_overlap = np.where(frame_overlap > 1, 1, 0)
        kernel = np.ones((3, 3), np.uint8)
        frame_overlap = cv2.dilate(np.uint8(frame_overlap), kernel, iterations=10).astype(np.uint8)
        cv2.floodFill(frame_overlap, None, (0, 0), 100)
        frame_overlap = np.where(frame_overlap != 100, 255, 0).astype(np.uint8)
        contours, _hierarchy = cv2.findContours(frame_overlap, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        for i in range(len(contours)):
            hull = cv2.convexHull(contours[i])
            cv2.drawContours(frame_overlap, [hull], -1, (255, 0, 0), 3)
        frame_overlap = np.where(frame_overlap > 0, 1, 0).astype(np.uint8)
        cv2.floodFill(frame_overlap, None, (0, 0), 100)
        frame_overlap = np.array(np.where(frame_overlap != 100, 255, 0), dtype=bool)

        for i in range(len(vid)):
            frame = vid[i, :, :, :].astype("uint8")
            frame = cv2.cvtColor(frame, cv2.COLOR_YUV2BGR)
            frame = cv2.bitwise_and(frame, frame, mask=frame_overlap.astype(np.uint8))
            vid[i, :, :, :] = frame
        return vid
    except Exception:
        return vid


def _synthetic_color_cine(frames=24, height=120, width=160, seed=7):
    """Colour cine with a moving bright sector on black background."""
    rng = np.random.default_rng(seed)
    video = np.zeros((frames, height, width, 3), dtype=np.uint8)
    yy, xx = np.mgrid[0:height, 0:width]
    for f in range(frames):
        cx = width // 2 + int(6 * np.sin(f / 3.0))
        cy = height // 2 + int(4 * np.cos(f / 3.0))
        disk = (yy - cy) ** 2 + (xx - cx) ** 2 <= (min(height, width) // 3) ** 2
        noise = rng.integers(40, 255, size=(height, width, 3), dtype=np.uint8)
        video[f][disk] = noise[disk]
    return video


@pytest.fixture()
def echoprime_modules(tmp_path, monkeypatch):
    """
    Import EchoPrime modules without requiring real model weights in this checkout.

    The production runtime path resolver stays strict; this test provides the
    minimal asset layout it expects before importing modules that resolve assets
    at import time.
    """
    model_root = tmp_path / "AI_models"
    secondary_root = model_root / "secondary_analysis"
    weights_root = secondary_root / "model_data" / "weights"
    assets_root = secondary_root / "assets"
    weights_root.mkdir(parents=True)
    assets_root.mkdir(parents=True)
    (weights_root / "echo_prime_encoder.pt").write_bytes(b"")
    (weights_root / "view_classifier.pt").write_bytes(b"")
    (assets_root / "MIL_weights.csv").write_text("", encoding="utf-8")
    (assets_root / "per_section.json").write_text(json.dumps({}), encoding="utf-8")
    (assets_root / "all_phr.json").write_text(json.dumps({}), encoding="utf-8")

    from app.core import runtime_paths

    monkeypatch.setattr(runtime_paths, "_source_model_assets_root", lambda: model_root)

    utils_module = importlib.import_module("app.AI_models.EchoPrime.utils.utils")
    model_module = importlib.import_module("app.AI_models.EchoPrime.echo_prime.model")
    return model_module.EchoPrime, utils_module


def test_wrapper_matches_original_full_video(echoprime_modules):
    _EchoPrime, utils = echoprime_modules
    video = _synthetic_color_cine()
    expected = _original_mask_outside_ultrasound(video)
    actual = utils.mask_outside_ultrasound(video)
    np.testing.assert_array_equal(actual, expected)


def test_sampled_apply_matches_original_masked_frames(echoprime_modules):
    _EchoPrime, utils = echoprime_modules
    video = _synthetic_color_cine()
    expected_full = _original_mask_outside_ultrasound(video)

    mask = utils.compute_ultrasound_sector_mask(video)
    sample_indices = [0, 5, 11, 17, 23]
    for idx in sample_indices:
        frame = utils.apply_ultrasound_sector_mask(video[idx], mask).astype(video.dtype)
        np.testing.assert_array_equal(frame, expected_full[idx])


def test_compute_mask_never_mutates_input(echoprime_modules):
    _EchoPrime, utils = echoprime_modules
    video = _synthetic_color_cine()
    before = video.copy()
    utils.compute_ultrasound_sector_mask(video)
    np.testing.assert_array_equal(video, before)


def test_compute_mask_raises_on_grayscale(echoprime_modules):
    _EchoPrime, utils = echoprime_modules
    grayscale = np.zeros((8, 32, 32), dtype=np.uint8)
    with pytest.raises(Exception):
        utils.compute_ultrasound_sector_mask(grayscale)


def _lightweight_echoprime(EchoPrime):
    ep = EchoPrime.__new__(EchoPrime)
    ep.frames_to_take = 16
    ep.frame_stride = 1
    ep.video_size = 224
    ep.mean = torch.zeros((3, 1, 1, 1), dtype=torch.float32)
    ep.std = torch.ones((3, 1, 1, 1), dtype=torch.float32)
    ep.device = torch.device("cpu")
    return ep


def test_process_pixel_array_matches_original_pipeline(echoprime_modules):
    """End-to-end: sample-then-mask clip == original mask-everything clip."""
    EchoPrime, utils = echoprime_modules
    ep = _lightweight_echoprime(EchoPrime)
    video = _synthetic_color_cine(frames=40)

    actual = ep.process_pixel_array(video)
    assert actual is not None

    # Original pipeline: mask whole video, coerce, sample, crop/scale, normalize.
    masked = _original_mask_outside_ultrasound(video)[:, :, :, :3]
    indices = np.linspace(0, len(masked) - 1, ep.frames_to_take).round().astype(int)
    x = np.empty((ep.frames_to_take, ep.video_size, ep.video_size, 3), dtype=np.float32)
    for out_idx, src_idx in enumerate(indices):
        x[out_idx] = utils.crop_and_scale(masked[src_idx]).astype(np.float32, copy=False)
    expected = torch.as_tensor(x, dtype=torch.float32).permute([3, 0, 1, 2])
    expected.sub_(ep.mean).div_(ep.std)

    assert torch.equal(actual, expected)


def test_process_pixel_array_grayscale_fallback_still_works(echoprime_modules):
    EchoPrime, _utils = echoprime_modules
    ep = _lightweight_echoprime(EchoPrime)
    rng = np.random.default_rng(3)
    pixels = rng.integers(0, 255, size=(12, 64, 64), dtype=np.uint8).astype(np.float32)
    output = ep.process_pixel_array(pixels)
    assert output is not None
    assert output.shape == (3, 16, 224, 224)
