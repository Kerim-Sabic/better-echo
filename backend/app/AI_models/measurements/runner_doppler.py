import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import pydicom
import torch
from torchvision.models.segmentation import deeplabv3_resnet50

from app.helpers.device_selector import get_device_for_model
from app.helpers.doppler_frame_selection import select_doppler_frame
from app.helpers.doppler_tags import extract_doppler_region


logger = logging.getLogger(__name__)


VALID_DOPPLER_WEIGHTS = {
    "avvmax",
    "trvmax",
    "mrvmax",
    "lvotvmax",
    "latevel",
    "medevel",
    "mvpeak_2c",
    "tapse_2c",
}
_TWO_POINT_WEIGHTS = {"mvpeak_2c", "tapse_2c"}
_SINGLE_POINT_CONFIDENCE_MIN = 0.0100
_TWO_POINT_CONFIDENCE_MIN = 0.0100

_loaded_models: Dict[str, torch.nn.Module] = {}
_device: Optional[torch.device] = None


def get_device() -> torch.device:
    global _device
    if _device is None:
        _device = get_device_for_model("measurements")
    return _device


def _load_model(model_key: str) -> torch.nn.Module:
    if model_key not in VALID_DOPPLER_WEIGHTS:
        raise ValueError(f"Invalid model_weights '{model_key}'.")
    if model_key in _loaded_models:
        return _loaded_models[model_key]

    base_dir = os.path.dirname(os.path.abspath(__file__))
    weights_path = os.path.join(base_dir, "weights", "Doppler_models", f"{model_key}_weights.ckpt")
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Weights not found: {weights_path}")

    num_classes = 2 if model_key in _TWO_POINT_WEIGHTS else 1
    device = get_device()
    try:
        state = torch.load(weights_path, map_location=device, weights_only=True)
    except TypeError:
        state = torch.load(weights_path, map_location=device)
    state = {k.replace("m.", ""): v for k, v in state.items()}

    start = time.time()
    model = deeplabv3_resnet50(num_classes=num_classes)
    model.load_state_dict(state)
    model.to(device)
    model.eval()
    _loaded_models[model_key] = model
    logger.info("[Doppler] Loaded model '%s' on %s in %.1fs", model_key, device, time.time() - start)
    return model


def _roi_tensor_from_image(image_rgb: np.ndarray, y0: int) -> torch.Tensor:
    y0 = max(0, int(y0))
    doppler_roi = image_rgb[y0:, :, :]
    if doppler_roi.size == 0:
        raise ValueError("Empty Doppler ROI after y0 crop.")
    tensor = torch.from_numpy(doppler_roi).permute(2, 0, 1).unsqueeze(0).float() / 255.0
    return tensor.to(get_device())


def _predict_single_point(model: torch.nn.Module, roi_tensor: torch.Tensor) -> Tuple[int, int, float]:
    with torch.no_grad():
        logits = model(roi_tensor)["out"]
        probs = torch.sigmoid(logits)
    arr = probs.squeeze().detach().cpu().numpy()
    y, x = np.unravel_index(np.argmax(arr), arr.shape)
    score = float(arr[y, x])
    return int(x), int(y), score


def _predict_two_points(model: torch.nn.Module, roi_tensor: torch.Tensor) -> Tuple[Tuple[int, int], Tuple[int, int], Tuple[float, float]]:
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

    # Keep deterministic left->right ordering for downstream math.
    if p0[0] <= p1[0]:
        return p0, p1, (s0, s1)
    return p1, p0, (s1, s0)


def _save_overlay_image(
    image_rgb: np.ndarray,
    output_dir: str,
    model_weights: str,
    points_abs: List[Tuple[int, int]],
    overlay_label: Optional[str] = None,
) -> str:
    """
    Save a debug overlay image with visible point markers and optional metric label.
    """
    # --- Part 1: Draw markers and optional connection line ---
    os.makedirs(output_dir, exist_ok=True)
    canvas = image_rgb.copy()
    for point in points_abs:
        cv2.drawMarker(
            canvas,
            point,
            color=(0, 0, 0),
            markerType=cv2.MARKER_CROSS,
            markerSize=18,
            thickness=4,
            line_type=cv2.LINE_AA,
        )
        cv2.drawMarker(
            canvas,
            point,
            color=(135, 206, 235),
            markerType=cv2.MARKER_CROSS,
            markerSize=16,
            thickness=2,
            line_type=cv2.LINE_AA,
        )
    if len(points_abs) == 2:
        cv2.line(canvas, points_abs[0], points_abs[1], (255, 0, 0), 2)

    # --- Part 2: Draw readable text label near marker ---
    if overlay_label:
        if len(points_abs) == 1:
            anchor = points_abs[0]
        elif len(points_abs) == 2:
            anchor = (
                int((points_abs[0][0] + points_abs[1][0]) / 2),
                int((points_abs[0][1] + points_abs[1][1]) / 2),
            )
        else:
            anchor = (20, 30)

        text_x = max(12, min(anchor[0] + 12, max(12, canvas.shape[1] - 260)))
        text_y = max(24, min(anchor[1] - 12, max(24, canvas.shape[0] - 12)))
        origin = (text_x, text_y)

        cv2.putText(
            canvas,
            overlay_label,
            origin,
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (0, 0, 0),
            3,
            cv2.LINE_AA,
        )
        cv2.putText(
            canvas,
            overlay_label,
            origin,
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (235, 235, 235),
            1,
            cv2.LINE_AA,
        )

    # --- Part 3: Save overlay image ---
    filename = f"{model_weights}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    out_path = os.path.join(output_dir, filename)
    bgr = cv2.cvtColor(canvas, cv2.COLOR_RGB2BGR)
    cv2.imwrite(out_path, bgr)
    return out_path


def run_doppler_inference(
    *,
    model_weights: str,
    input_path: str,
    output_dir: str,
    region_override: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Run Doppler inference on a single DICOM and return structured metric payload.

    Steps:
    1. Validate model/input and resolve spectral Doppler region tags.
    2. Select an inference frame (single-frame direct path or dynamic mature-window with fallback).
    3. Run model prediction and convert output to measurement-specific metric value.
    4. Save overlay artifact and return structured payload with metadata.
    """
    # --- Part 1: Validate request inputs and resolve Doppler tags ---
    model_weights = model_weights.strip().lower()
    if model_weights not in VALID_DOPPLER_WEIGHTS:
        raise ValueError(f"Invalid model_weights '{model_weights}'.")
    if not input_path.lower().endswith(".dcm"):
        raise ValueError("Doppler inference expects a DICOM input.")

    ds = pydicom.dcmread(input_path, force=True)
    region = (
        dict(region_override)
        if isinstance(region_override, dict)
        else extract_doppler_region(ds)
    )
    if not region:
        raise ValueError("No valid spectral ultrasound region found in DICOM.")
    if region.get("y0") is None:
        raise ValueError("Doppler region y0 is missing.")

    # --- Part 2: Select frame and run model on Doppler ROI ---
    image_rgb, frame_selection = select_doppler_frame(ds, int(region["y0"]))
    roi_tensor = _roi_tensor_from_image(image_rgb, int(region["y0"]))
    model = _load_model(model_weights)

    y0 = int(region["y0"])
    baseline = region.get("reference_line")
    delta_x = region.get("physical_delta_x")
    delta_y = region.get("physical_delta_y")
    if baseline is None or delta_y is None:
        raise ValueError("Required Doppler tags are missing (reference line or physical delta y).")

    metric_name = model_weights
    metric_value = None
    units = None
    metadata: Dict[str, Any] = {
        "reference_line": baseline,
        "physical_delta_x": delta_x,
        "physical_delta_y": delta_y,
        "doppler_region": region,
        "frame_selection": frame_selection,
    }
    points_abs: List[Tuple[int, int]] = []
    confidence_score: Optional[float] = None
    confidence_threshold: float = _SINGLE_POINT_CONFIDENCE_MIN

    # --- Part 3: Convert model output to metric value by weight type ---
    if model_weights in _TWO_POINT_WEIGHTS:
        confidence_threshold = _TWO_POINT_CONFIDENCE_MIN
        if delta_x is None:
            raise ValueError("Required Doppler tag physical delta x is missing for 2-point model.")
        p0, p1, scores = _predict_two_points(model, roi_tensor)
        p0_abs = (p0[0], p0[1] + y0)
        p1_abs = (p1[0], p1[1] + y0)
        points_abs = [p0_abs, p1_abs]
        metadata["point_scores"] = {"point0": scores[0], "point1": scores[1]}
        confidence_score = float(min(scores))

        if model_weights == "mvpeak_2c":
            v0 = abs((p0_abs[1] - (y0 + int(baseline))) * float(delta_y))
            v1 = abs((p1_abs[1] - (y0 + int(baseline))) * float(delta_y))
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
            distance_cm = float(np.sqrt((dx_cm ** 2) + (dy_cm ** 2)))
            metric_name = "tapse"
            metric_value = round(distance_cm, 4)
            units = "cm"
    else:
        x, y, score = _predict_single_point(model, roi_tensor)
        x_abs = x
        y_abs = y + y0
        points_abs = [(x_abs, y_abs)]
        signed_velocity = float(delta_y) * float(y_abs - (y0 + int(baseline)))
        metric_value = round(abs(signed_velocity), 4)
        metric_name = model_weights
        units = "cm/s"
        metadata["point_score"] = score
        confidence_score = float(score)
        metadata["signed_velocity_cm_s"] = round(signed_velocity, 4)

    # --- Part 4: Attach confidence metadata and label text ---
    is_low_confidence = bool(confidence_score is not None and confidence_score < confidence_threshold)
    metadata["confidence_score"] = round(float(confidence_score), 6) if confidence_score is not None else None
    metadata["confidence_threshold"] = confidence_threshold
    metadata["low_confidence"] = is_low_confidence
    if is_low_confidence:
        metadata["confidence_warning"] = "Prediction confidence is below threshold; review manually."

    unit_text = units or ""
    if metric_value is None:
        value_text = "N/A"
    elif unit_text == "ratio":
        value_text = f"{metric_value:.3f}"
    else:
        value_text = f"{metric_value:.2f}"
    overlay_label = f"{metric_name}: {value_text} {unit_text}".strip()
    if is_low_confidence:
        overlay_label = f"{overlay_label} (low conf)"

    # --- Part 5: Save overlay artifact and return result payload ---
    output_image = _save_overlay_image(
        image_rgb=image_rgb,
        output_dir=output_dir,
        model_weights=model_weights,
        points_abs=points_abs,
        overlay_label=overlay_label,
    )
    metadata["points_abs"] = points_abs

    return {
        "model_weights": model_weights,
        "metric_name": metric_name,
        "metric_value": metric_value,
        "units": units,
        "output_file_image": output_image,
        "metadata": metadata,
    }
