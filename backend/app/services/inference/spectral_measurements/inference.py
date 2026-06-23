from __future__ import annotations

import gc
import logging
import os
import time
from typing import Optional

import numpy as np
import torch
from torchvision.models.segmentation import deeplabv3_resnet50

from app.AI_models.measurements.constants import VALID_DOPPLER_WEIGHTS
from app.core.runtime_paths import model_assets_dir
from app.helpers.inference_runtime.device_selector import get_device_for_model
from app.services.inference.spectral_measurements.geometry import (
    DopplerMeasurementInputs,
    build_reference_line,
    load_doppler_inputs,
)

logger = logging.getLogger(__name__)

TWO_POINT_DOPPLER_WEIGHTS = {"mvpeak_2c", "tapse_2c"}
SINGLE_POINT_CONFIDENCE_MIN = 0.0100
TWO_POINT_CONFIDENCE_MIN = 0.0100

_loaded_models: dict[str, torch.nn.Module] = {}
_device: Optional[torch.device] = None


def get_device() -> torch.device:
    global _device
    if _device is None:
        _device = get_device_for_model("study_measurements")
    return _device


def load_doppler_model(model_key: str) -> torch.nn.Module:
    model_key = model_key.strip().lower()
    if model_key not in VALID_DOPPLER_WEIGHTS:
        raise ValueError(f"Invalid model_weights '{model_key}'.")
    if model_key in _loaded_models:
        return _loaded_models[model_key]

    base_dir = os.path.join(str(model_assets_dir("study_measurements")), "weights")
    weights_path = os.path.join(base_dir, "Doppler_models", f"{model_key}_weights.ckpt")
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Weights not found: {weights_path}")

    num_classes = 2 if model_key in TWO_POINT_DOPPLER_WEIGHTS else 1
    device = get_device()
    try:
        state = torch.load(weights_path, map_location=device, weights_only=True)
    except TypeError:
        state = torch.load(weights_path, map_location=device)
    state = {key.replace("m.", ""): value for key, value in state.items()}

    start = time.time()
    model = deeplabv3_resnet50(num_classes=num_classes)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    _loaded_models[model_key] = model
    logger.info(
        "[Doppler] Loaded model '%s' on %s in %.1fs",
        model_key,
        device,
        time.time() - start,
    )
    return model


def unload_doppler_models(*, keep_weight: Optional[str] = None) -> None:
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


def _roi_tensor_from_image(image_rgb: np.ndarray, y0: int) -> torch.Tensor:
    y0 = max(0, int(y0))
    doppler_roi = image_rgb[y0:, :, :]
    if doppler_roi.size == 0:
        raise ValueError("Empty Doppler ROI after y0 crop.")
    tensor = torch.from_numpy(doppler_roi).permute(2, 0, 1).unsqueeze(0).float() / 255.0
    return tensor.to(get_device())


def _predict_single_point(model: torch.nn.Module, roi_tensor: torch.Tensor) -> tuple[int, int, float]:
    with torch.no_grad():
        logits = model(roi_tensor)["out"]
        probs = torch.sigmoid(logits)
    array = probs.squeeze().detach().cpu().numpy()
    y, x = np.unravel_index(np.argmax(array), array.shape)
    return int(x), int(y), float(array[y, x])


def _predict_two_points(
    model: torch.nn.Module,
    roi_tensor: torch.Tensor,
) -> tuple[tuple[int, int], tuple[int, int], tuple[float, float]]:
    with torch.no_grad():
        logits = model(roi_tensor)["out"]
        probs = torch.sigmoid(logits).squeeze(0).detach().cpu().numpy()

    if probs.shape[0] < 2:
        raise ValueError("Expected 2-channel output for two-point Doppler model.")

    c0 = probs[0]
    c1 = probs[1]
    y0, x0 = np.unravel_index(np.argmax(c0), c0.shape)
    y1, x1 = np.unravel_index(np.argmax(c1), c1.shape)
    p0 = (int(x0), int(y0))
    p1 = (int(x1), int(y1))
    s0 = float(c0[y0, x0])
    s1 = float(c1[y1, x1])
    if p0[0] <= p1[0]:
        return p0, p1, (s0, s1)
    return p1, p0, (s1, s0)


def _point(point_id: str, x: int, y: int, confidence: float | None) -> dict:
    return {
        "id": point_id,
        "x": int(x),
        "y": int(y),
        "confidence": round(float(confidence), 6) if confidence is not None else None,
    }


# Part 1. Preserve Doppler model math while returning structured point geometry.
def predict_doppler_measurement(
    *,
    model_weights: str,
    inputs: DopplerMeasurementInputs,
) -> dict:
    model_weights = model_weights.strip().lower()
    if model_weights not in VALID_DOPPLER_WEIGHTS:
        raise ValueError(f"Invalid model_weights '{model_weights}'.")

    region = inputs.region
    y0 = int(region["y0"])
    baseline = region.get("reference_line")
    delta_x = region.get("physical_delta_x")
    delta_y = region.get("physical_delta_y")
    if baseline is None or delta_y is None:
        raise ValueError("Required Doppler tags are missing (reference line or physical delta y).")

    model = load_doppler_model(model_weights)
    roi_tensor = _roi_tensor_from_image(inputs.image_rgb, y0)
    baseline_y = y0 + int(baseline)
    metric_name = model_weights
    metric_value = None
    units = None
    points: list[dict] = []
    segments: list[dict] = []
    metadata: dict = {
        "reference_line": baseline,
        "physical_delta_x": delta_x,
        "physical_delta_y": delta_y,
        "doppler_region": region,
        "frame_selection": inputs.frame_selection,
    }
    confidence_score: float | None = None
    confidence_threshold = SINGLE_POINT_CONFIDENCE_MIN

    if model_weights in TWO_POINT_DOPPLER_WEIGHTS:
        confidence_threshold = TWO_POINT_CONFIDENCE_MIN
        if delta_x is None:
            raise ValueError("Required Doppler tag physical delta x is missing for 2-point model.")
        p0, p1, scores = _predict_two_points(model, roi_tensor)
        p0_abs = (p0[0], p0[1] + y0)
        p1_abs = (p1[0], p1[1] + y0)
        points = [
            _point("p0", p0_abs[0], p0_abs[1], scores[0]),
            _point("p1", p1_abs[0], p1_abs[1], scores[1]),
        ]
        segments = [{"from": "p0", "to": "p1", "role": "measurement_line"}]
        metadata["point_scores"] = {"point0": scores[0], "point1": scores[1]}
        confidence_score = float(min(scores))

        if model_weights == "mvpeak_2c":
            v0 = abs((p0_abs[1] - baseline_y) * float(delta_y))
            v1 = abs((p1_abs[1] - baseline_y) * float(delta_y))
            e_vel = max(v0, v1)
            a_vel = min(v0, v1)
            ea_ratio = (e_vel / a_vel) if a_vel > 0 else None
            metric_name = "mv_e_over_a"
            metric_value = round(float(ea_ratio), 4) if ea_ratio is not None else None
            units = "ratio"
            metadata["e_velocity_cm_s"] = round(float(e_vel), 4)
            metadata["a_velocity_cm_s"] = round(float(a_vel), 4)
        else:
            dx_cm = abs((p0_abs[0] - p1_abs[0]) * float(delta_x))
            dy_cm = abs((p0_abs[1] - p1_abs[1]) * float(delta_y))
            metric_name = "tapse"
            metric_value = round(float(np.sqrt((dx_cm ** 2) + (dy_cm ** 2))), 4)
            units = "cm"
    else:
        x, y, score = _predict_single_point(model, roi_tensor)
        x_abs = int(x)
        y_abs = int(y + y0)
        points = [_point("p0", x_abs, y_abs, score)]
        signed_velocity = float(delta_y) * float(y_abs - baseline_y)
        metric_value = round(abs(signed_velocity), 4)
        metric_name = model_weights
        units = "cm/s"
        metadata["point_score"] = score
        metadata["signed_velocity_cm_s"] = round(signed_velocity, 4)
        confidence_score = float(score)

    low_confidence = bool(
        confidence_score is not None and confidence_score < confidence_threshold
    )
    metadata["points_abs"] = [(point["x"], point["y"]) for point in points]
    metadata["confidence_score"] = (
        round(float(confidence_score), 6) if confidence_score is not None else None
    )
    metadata["confidence_threshold"] = confidence_threshold
    metadata["low_confidence"] = low_confidence
    if low_confidence:
        metadata["confidence_warning"] = "Prediction confidence is below threshold; review manually."

    return {
        "model_weights": model_weights,
        "metric_name": metric_name,
        "metric_value": metric_value,
        "units": units,
        "frame_width": inputs.frame_width,
        "frame_height": inputs.frame_height,
        "selected_frame_index": inputs.frame_selection.get("selected_frame_index", 0),
        "points": points,
        "segments": segments,
        "reference_line": build_reference_line(region),
        "doppler_region": region,
        "frame_selection": inputs.frame_selection,
        "geometry_type": "point_line" if segments else "point_marker",
        "quality": {
            "confidence_score": metadata["confidence_score"],
            "confidence_threshold": confidence_threshold,
            "low_confidence": low_confidence,
            "warnings": ["low_confidence"] if low_confidence else [],
        },
        "metadata": metadata,
    }


def run_doppler_inference(
    *,
    model_weights: str,
    input_path: str,
    region_override: dict | None = None,
) -> dict:
    inputs = load_doppler_inputs(
        input_path=input_path,
        region_override=region_override,
    )
    return predict_doppler_measurement(
        model_weights=model_weights,
        inputs=inputs,
    )


__all__ = [
    "SINGLE_POINT_CONFIDENCE_MIN",
    "TWO_POINT_CONFIDENCE_MIN",
    "TWO_POINT_DOPPLER_WEIGHTS",
    "get_device",
    "load_doppler_model",
    "predict_doppler_measurement",
    "run_doppler_inference",
    "unload_doppler_models",
]
