from __future__ import annotations

import gc
import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np
import torch
from torchvision.models.segmentation import deeplabv3_resnet50

from app.AI_models.measurements.constants import VALID_2D_WEIGHTS
from app.core.runtime_paths import model_assets_dir
from app.helpers.inference_runtime import precision
from app.helpers.inference_runtime.adaptive_batch import run_adaptive_batches
from app.helpers.inference_runtime.batch_config import get_batch_size
from app.helpers.inference_runtime.device_selector import get_device_for_model
from app.helpers.inference_runtime.temporal_sampling import (
    interpolate_confidences,
    interpolate_keypoints,
    passes_self_check,
    pick_self_check_indices,
    plan_temporal_sampling,
)

logger = logging.getLogger(__name__)

MODEL_INPUT_SIZE = (640, 480)


def build_model_input_tensor(model_frames_bgr: list[np.ndarray]) -> torch.Tensor:
    """
    Normalize source frames into the exact NCHW float tensor the 2D models
    expect. Built once per instance (via the study frame cache) and shared
    across every routed measurement weight, eliminating the per-weight
    decode/colour-convert/normalise that used to repeat for each of the ~9
    routed models on the same cine.
    """
    frames_rgb = np.stack(
        [cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) for frame in model_frames_bgr],
        axis=0,
    )
    tensor = torch.from_numpy(frames_rgb).float() / 255.0
    return tensor.permute(0, 3, 1, 2).contiguous()

_loaded_models: dict[str, torch.nn.Module] = {}
_device: Optional[torch.device] = None


@dataclass(frozen=True)
class LinearMeasurementPrediction:
    coordinates: np.ndarray
    point_confidences: np.ndarray


def get_device() -> torch.device:
    global _device
    if _device is None:
        _device = get_device_for_model("study_measurements")
    return _device


def _segmentation_to_coordinates(logits: torch.Tensor, order: str = "XY") -> torch.Tensor:
    h, w = logits.shape[-2], logits.shape[-1]
    rows = torch.arange(h, device=logits.device)[None, None, :, None]
    cols = torch.arange(w, device=logits.device)[None, None, None, :]

    denom = logits.sum(dim=(-2, -1), keepdim=True) + 1e-8
    y = (rows * logits).sum(dim=(-2, -1)) / denom.squeeze(-1).squeeze(-1)
    x = (cols * logits).sum(dim=(-2, -1)) / denom.squeeze(-1).squeeze(-1)
    if order.upper() == "XY":
        return torch.stack([x, y], dim=-1)
    return torch.stack([y, x], dim=-1)


def _point_peak_confidences(probs: torch.Tensor) -> torch.Tensor:
    return probs.flatten(start_dim=2).amax(dim=2)


def load_2d_model(model_key: str) -> torch.nn.Module:
    model_key = model_key.strip().lower()
    if model_key not in VALID_2D_WEIGHTS:
        raise ValueError(f"Invalid model_weights '{model_key}'.")
    if model_key in _loaded_models:
        return _loaded_models[model_key]

    base_dir = os.path.join(str(model_assets_dir("study_measurements")), "weights")
    weights_path = os.path.join(base_dir, "2D_models", f"{model_key}_weights.ckpt")
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Weights not found: {weights_path}")

    device = get_device()
    try:
        state = torch.load(weights_path, map_location=device, weights_only=True)
    except TypeError:
        state = torch.load(weights_path, map_location=device)
    state = {key.replace("m.", ""): value for key, value in state.items()}

    start = time.time()
    model = deeplabv3_resnet50(num_classes=2)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    precision.configure_backends(device)
    model = precision.to_channels_last(model, device)
    _loaded_models[model_key] = model
    logger.info(
        "[Measurements2D] Loaded model '%s' on %s in %.1fs | %s",
        model_key,
        device,
        time.time() - start,
        precision.describe(device).as_dict(),
    )
    return model


def unload_2d_models(*, keep_weight: Optional[str] = None) -> None:
    global _loaded_models
    if not _loaded_models:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return

    keep = keep_weight.strip().lower() if isinstance(keep_weight, str) else None
    for key in list(_loaded_models.keys()):
        if keep and key == keep:
            continue
        _loaded_models.pop(key, None)
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def _infer_points_for_tensor(
    *,
    model: torch.nn.Module,
    tensor: torch.Tensor,
    device: torch.device,
    batch_size: int,
) -> tuple[list[np.ndarray], list[np.ndarray]]:
    """Run the sigmoid-centroid inference path over an NCHW input tensor."""
    predictions: list[np.ndarray] = []
    point_confidences: list[np.ndarray] = []
    total = tensor.shape[0]
    start = time.time()

    def _run_batch(batch_start: int, batch_end: int):
        batch_tensor = tensor[batch_start:batch_end].to(device)
        batch_tensor = precision.as_channels_last(batch_tensor, device)
        with torch.no_grad(), precision.autocast(device):
            logits = model(batch_tensor)["out"]
            # Centroid + peak-confidence math runs in FP32 so the reduction over
            # the 640x480 map matches the FP32 path within tolerance regardless
            # of whether the conv stack executed in FP16.
            probs = torch.sigmoid(logits.float())
        coords_batch = _segmentation_to_coordinates(probs, order="XY").detach().cpu().numpy()
        confidence_batch = _point_peak_confidences(probs).detach().cpu().numpy()
        return coords_batch, confidence_batch

    for _batch_start, batch_end, (coords_batch, confidence_batch) in run_adaptive_batches(
        total,
        batch_size,
        _run_batch,
        device=device,
        label="Measurements2D",
    ):
        predictions.extend(coords_batch)
        point_confidences.extend(confidence_batch)
        if batch_end == total or batch_end % max(1, batch_size * 2) == 0:
            elapsed = time.time() - start
            fps = batch_end / elapsed if elapsed > 0 else 0
            logger.info(
                "[Measurements2D] Processed %d/%d frames (%.1fs, %.1f fps, device=%s)",
                batch_end,
                total,
                elapsed,
                fps,
                device,
            )

    return predictions, point_confidences


@dataclass(frozen=True)
class _TemporalConfig:
    stride: int
    interpolation: bool
    self_check: bool
    self_check_samples: int
    max_point_error_px: float


def _temporal_config() -> _TemporalConfig:
    from app.core.config import settings

    def _int(name: str, default: int) -> int:
        try:
            return int(getattr(settings, name, default))
        except Exception:
            return default

    def _float(name: str, default: float) -> float:
        try:
            return float(getattr(settings, name, default))
        except Exception:
            return default

    def _bool(name: str, default: bool) -> bool:
        try:
            return bool(getattr(settings, name, default))
        except Exception:
            return default

    return _TemporalConfig(
        stride=_int("LINEAR_TEMPORAL_STRIDE", 1),
        interpolation=_bool("LINEAR_TEMPORAL_INTERPOLATION", True),
        self_check=_bool("LINEAR_TEMPORAL_SELF_CHECK", True),
        self_check_samples=_int("LINEAR_TEMPORAL_SELF_CHECK_SAMPLES", 3),
        max_point_error_px=_float("LINEAR_TEMPORAL_MAX_POINT_ERROR_PX", 2.0),
    )


def _predict_temporal(
    *,
    model: torch.nn.Module,
    tensor: torch.Tensor,
    device: torch.device,
    batch_size: int,
    config: _TemporalConfig,
) -> Optional[LinearMeasurementPrediction]:
    """
    Infer keypoints on a strided subset of frames and interpolate the rest.

    Returns None (telling the caller to fall back to full every-frame inference)
    when the plan saves nothing or the runtime self-check fails - so a clip whose
    motion is too fast for interpolation silently gets full-fidelity inference.
    """
    total = int(tensor.shape[0])
    plan = plan_temporal_sampling(total, config.stride)
    if not plan.enabled:
        return None

    sub = tensor[plan.inferred_indices]
    coords_list, conf_list = _infer_points_for_tensor(
        model=model, tensor=sub, device=device, batch_size=batch_size
    )
    coords_inferred = np.asarray(coords_list, dtype=np.float32)
    conf_inferred = np.asarray(conf_list, dtype=np.float32)

    coords_full = interpolate_keypoints(plan.inferred_indices, coords_inferred, total)
    conf_full = interpolate_confidences(plan.inferred_indices, conf_inferred, total)

    if config.self_check:
        check_indices = pick_self_check_indices(plan, config.self_check_samples)
        if check_indices:
            check_sub = tensor[check_indices]
            actual_list, _ = _infer_points_for_tensor(
                model=model, tensor=check_sub, device=device, batch_size=batch_size
            )
            actual = np.asarray(actual_list, dtype=np.float32)
            interpolated_at_checks = coords_full[check_indices]
            passed, observed = passes_self_check(
                interpolated_at_checks, actual, config.max_point_error_px
            )
            logger.info(
                "[Measurements2D] Temporal self-check stride=%d frames=%d "
                "checked=%d max_err_px=%.3f limit=%.3f -> %s",
                config.stride,
                total,
                len(check_indices),
                observed,
                config.max_point_error_px,
                "PASS" if passed else "FALLBACK",
            )
            if not passed:
                return None

    return LinearMeasurementPrediction(
        coordinates=coords_full.reshape(total, coords_inferred.shape[1], coords_inferred.shape[2]),
        point_confidences=conf_full,
    )


def predict_linear_measurement_points(
    *,
    model_weights: str,
    model_frames_bgr: Optional[list[np.ndarray]] = None,
    model_input_tensor: Optional[torch.Tensor] = None,
) -> LinearMeasurementPrediction:
    # Part 1. Reuse the shared, preprocessed input tensor when the caller already
    # built it (once per instance, via the study frame cache). Fall back to
    # building it here so direct callers keep working unchanged.
    if model_input_tensor is None:
        if not model_frames_bgr:
            raise RuntimeError("No frames available for measurements.")
        model_input_tensor = build_model_input_tensor(model_frames_bgr)
    if model_input_tensor.shape[0] == 0:
        raise RuntimeError("No frames available for measurements.")

    model = load_2d_model(model_weights)
    device = get_device()
    batch_size = get_batch_size("study_measurements")

    # Part 2. Optional temporal subsampling (Part 4): infer every N-th frame and
    # interpolate, with a runtime self-gate that falls back to full inference if
    # interpolation error is too high. Off unless LINEAR_TEMPORAL_STRIDE > 1.
    config = _temporal_config()
    if config.stride > 1 and config.interpolation:
        temporal_prediction = _predict_temporal(
            model=model,
            tensor=model_input_tensor,
            device=device,
            batch_size=batch_size,
            config=config,
        )
        if temporal_prediction is not None:
            return temporal_prediction

    # Part 3. Full every-frame inference (FP16 autocast on CUDA, FP32 on CPU)
    # with adaptive batching so a large configured batch degrades instead of OOM.
    predictions, point_confidences = _infer_points_for_tensor(
        model=model,
        tensor=model_input_tensor,
        device=device,
        batch_size=batch_size,
    )

    return LinearMeasurementPrediction(
        coordinates=np.asarray(predictions, dtype=np.float32),
        point_confidences=np.asarray(point_confidences, dtype=np.float32),
    )


__all__ = [
    "MODEL_INPUT_SIZE",
    "LinearMeasurementPrediction",
    "build_model_input_tensor",
    "get_device",
    "load_2d_model",
    "predict_linear_measurement_points",
    "unload_2d_models",
]
