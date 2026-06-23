from __future__ import annotations

import gc
import logging
import os
import time
from typing import Optional

import cv2
import numpy as np
import torch
from torchvision.models.segmentation import deeplabv3_resnet50

from app.AI_models.measurements.constants import VALID_2D_WEIGHTS
from app.core.runtime_paths import model_assets_dir
from app.helpers.inference_runtime.batch_config import get_batch_size
from app.helpers.inference_runtime.device_selector import get_device_for_model

logger = logging.getLogger(__name__)

MODEL_INPUT_SIZE = (640, 480)

_loaded_models: dict[str, torch.nn.Module] = {}
_device: Optional[torch.device] = None


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
    _loaded_models[model_key] = model
    logger.info(
        "[Measurements2D] Loaded model '%s' on %s in %.1fs",
        model_key,
        device,
        time.time() - start,
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


def predict_linear_measurement_points(
    *,
    model_weights: str,
    model_frames_bgr: list[np.ndarray],
) -> np.ndarray:
    # Part 1. Normalize source frames into the exact tensor shape used by the existing model.
    if not model_frames_bgr:
        raise RuntimeError("No frames available for measurements.")

    frames_rgb = np.stack(
        [cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) for frame in model_frames_bgr],
        axis=0,
    )
    tensor = torch.from_numpy(frames_rgb).float() / 255.0
    tensor = tensor.permute(0, 3, 1, 2)

    model = load_2d_model(model_weights)
    device = get_device()
    batch_size = get_batch_size("study_measurements")
    predictions: list[np.ndarray] = []
    start = time.time()

    # Part 2. Preserve the existing sigmoid centroid inference path.
    with torch.no_grad():
        for batch_start in range(0, tensor.shape[0], batch_size):
            batch_end = min(batch_start + batch_size, tensor.shape[0])
            batch_tensor = tensor[batch_start:batch_end].to(device)
            logits = model(batch_tensor)["out"]
            probs = torch.sigmoid(logits)
            coords_batch = (
                _segmentation_to_coordinates(probs, order="XY")
                .detach()
                .cpu()
                .numpy()
            )
            predictions.extend(coords_batch)

            if batch_end == tensor.shape[0] or batch_end % max(1, batch_size * 2) == 0:
                elapsed = time.time() - start
                fps = batch_end / elapsed if elapsed > 0 else 0
                logger.info(
                    "[Measurements2D] Processed %d/%d frames (%.1fs, %.1f fps, device=%s)",
                    batch_end,
                    tensor.shape[0],
                    elapsed,
                    fps,
                    device,
                )

    return np.asarray(predictions, dtype=np.float32)


__all__ = [
    "MODEL_INPUT_SIZE",
    "get_device",
    "load_2d_model",
    "predict_linear_measurement_points",
    "unload_2d_models",
]
