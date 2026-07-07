from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import pydicom
from pydicom.pixel_data_handlers.util import convert_color_space


def _normalize_uint8(image: np.ndarray) -> np.ndarray:
    if image.dtype == np.uint8:
        return image
    array = image.astype(np.float32)
    minimum, maximum = float(np.min(array)), float(np.max(array))
    if maximum <= minimum:
        return np.zeros_like(array, dtype=np.uint8)
    array = (array - minimum) / (maximum - minimum)
    return (array * 255.0).clip(0, 255).astype(np.uint8)


def _to_rgb_image(frame: np.ndarray, photometric: str) -> np.ndarray:
    image = frame
    if image.ndim == 2:
        image = np.stack((image,) * 3, axis=-1)
    image = _normalize_uint8(image)

    if photometric == "YBR_FULL_422" and image.ndim == 3:
        image = convert_color_space(arr=image, current="YBR_FULL_422", desired="RGB")

    if image.ndim != 3 or image.shape[2] != 3:
        raise ValueError("Unsupported image format for Doppler frame selection.")

    # Never write through to the caller's pixel array (it may be a shared,
    # read-only cached decode); the ECG masking below is in-place.
    if np.may_share_memory(image, frame):
        image = image.copy()

    # Mask likely ECG overlay line in color captures.
    ecg_mask = np.logical_and(image[:, :, 1] > 200, image[:, :, 0] < 100)
    image[ecg_mask, :] = 0
    return image


def _safe_positive_int(value: Any) -> Optional[int]:
    try:
        out = int(value)
        return out if out > 0 else None
    except Exception:
        return None


def _resolve_frame_count(ds: pydicom.Dataset, pixel_array: np.ndarray) -> int:
    return _resolve_frame_count_from(
        _safe_positive_int(getattr(ds, "NumberOfFrames", None)),
        str(getattr(ds, "PhotometricInterpretation", "")).upper(),
        pixel_array,
    )


def _resolve_frame_count_from(
    declared: Optional[int],
    photometric: str,
    pixel_array: np.ndarray,
) -> int:
    derived: Optional[int] = None
    if pixel_array.ndim == 4:
        derived = int(pixel_array.shape[0])
    elif pixel_array.ndim == 3 and photometric.startswith("MONOCHROME"):
        derived = int(pixel_array.shape[0])

    if declared and derived:
        return min(declared, derived)
    if declared:
        return declared
    if derived:
        return derived
    return 1


def _extract_frame(pixel_array: np.ndarray, frame_index: int, photometric: str) -> np.ndarray:
    if pixel_array.ndim == 4:
        return pixel_array[frame_index]
    if pixel_array.ndim == 3 and photometric.startswith("MONOCHROME"):
        return pixel_array[frame_index]
    return pixel_array


def _active_col_continuity(active_cols: np.ndarray, width: int) -> float:
    if active_cols.size == 0 or width <= 0:
        return 0.0
    if active_cols.size == 1:
        return 1.0 / float(width)
    gaps = np.diff(active_cols)
    run_starts = np.where(gaps > 1)[0]
    run_lengths: List[int] = []
    cursor = 0
    for split in run_starts.tolist():
        run_lengths.append(int(split - cursor + 1))
        cursor = int(split + 1)
    run_lengths.append(int(active_cols.size - cursor))
    return float(max(run_lengths)) / float(width)


def _spectral_frame_metrics(image_rgb: np.ndarray, y0: int) -> Dict[str, float]:
    y0 = max(0, min(int(y0), image_rgb.shape[0] - 1))
    roi = image_rgb[y0:, :, :]
    if roi.size == 0:
        return {
            "active_ratio": 0.0,
            "span_ratio": 0.0,
            "continuity_ratio": 0.0,
            "score": float("-inf"),
        }

    gray = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY)
    # Downsample for speed in cine prepass.
    small = cv2.resize(gray, dsize=None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    _, mask = cv2.threshold(small, 80, 255, cv2.THRESH_BINARY)
    active_ratio = float(np.mean(mask > 0))

    active_cols = np.flatnonzero(np.any(mask > 0, axis=0))
    width = int(mask.shape[1])
    if active_cols.size == 0 or width <= 0:
        return {
            "active_ratio": active_ratio,
            "span_ratio": 0.0,
            "continuity_ratio": 0.0,
            "score": active_ratio,
        }

    span_ratio = float(active_cols[-1] - active_cols[0] + 1) / float(width)
    continuity_ratio = _active_col_continuity(active_cols, width)
    score = (span_ratio * 4.0) + (continuity_ratio * 2.0) + (active_ratio * 3.0)

    return {
        "active_ratio": active_ratio,
        "span_ratio": span_ratio,
        "continuity_ratio": continuity_ratio,
        "score": score,
    }


def _find_mature_start(
    metrics_by_frame: List[Dict[str, float]],
    frame_indices: List[int],
    *,
    min_span_ratio: float = 0.70,
    min_active_ratio: float = 0.02,
    min_continuity_ratio: float = 0.20,
    stable_frames: int = 4,
) -> Optional[int]:
    streak = 0
    first_streak_frame: Optional[int] = None

    for frame_index, metrics in zip(frame_indices, metrics_by_frame):
        is_mature = (
            metrics["span_ratio"] >= min_span_ratio
            and metrics["active_ratio"] >= min_active_ratio
            and metrics["continuity_ratio"] >= min_continuity_ratio
        )

        if is_mature:
            streak += 1
            if first_streak_frame is None:
                first_streak_frame = frame_index
            if streak >= stable_frames:
                return first_streak_frame
        else:
            streak = 0
            first_streak_frame = None

    return None


def select_doppler_frame(ds: pydicom.Dataset, y0: int) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Select one frame for Doppler inference from single-frame or cine DICOM.
    """
    return select_doppler_frame_from_pixels(
        ds.pixel_array,
        str(getattr(ds, "PhotometricInterpretation", "")).upper(),
        _safe_positive_int(getattr(ds, "NumberOfFrames", None)),
        y0,
    )


def select_doppler_frame_from_pixels(
    pixel_array: np.ndarray,
    photometric: str,
    declared_frames: Optional[int],
    y0: int,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Select one frame for Doppler inference from decoded pixel data.

    Steps:
    1. Resolve frame count and return frame 0 for single-frame inputs.
    2. Run a lightweight full-cine prepass to detect mature spectral display onset.
    3. If mature onset is found, evaluate frames from that point; else fallback to last 25%.
    4. Return selected frame image and detailed selection metadata.
    """
    # --- Part 1: Resolve frame geometry and single-frame fast path ---
    photometric = (photometric or "").upper()
    frame_count = _resolve_frame_count_from(declared_frames, photometric, pixel_array)

    if frame_count <= 1:
        image_rgb = _to_rgb_image(pixel_array, photometric)
        return image_rgb, {
            "selection_mode": "single_frame",
            "num_frames": 1,
            "prepass_stride": 1,
            "frame_window_start_index": 0,
            "frame_window_end_index": 0,
            "selected_frame_index": 0,
            "selected_frame_score": None,
            "mature_start_index": None,
        }

    # --- Part 2: Lightweight prepass to detect mature spectrum onset ---
    prepass_stride = 2 if frame_count > 240 else 1
    prepass_indices = list(range(0, frame_count, prepass_stride))
    prepass_metrics: List[Dict[str, float]] = []
    for frame_index in prepass_indices:
        frame = _extract_frame(pixel_array, frame_index, photometric)
        image_rgb = _to_rgb_image(frame, photometric)
        prepass_metrics.append(_spectral_frame_metrics(image_rgb, y0))

    mature_start_index = _find_mature_start(prepass_metrics, prepass_indices)

    # --- Part 3: Select candidate window with mature-first, last-quarter fallback ---
    if mature_start_index is None:
        selection_mode = "last_quarter_fallback"
        window_start = max(0, int(frame_count * 0.75))
    else:
        selection_mode = "dynamic_mature_window"
        window_start = max(0, mature_start_index)
    window_end = frame_count - 1

    # --- Part 4: Score candidate frames and pick the best one ---
    best_score = float("-inf")
    best_index = window_start
    best_image_rgb: Optional[np.ndarray] = None

    for frame_index in range(window_start, frame_count):
        frame = _extract_frame(pixel_array, frame_index, photometric)
        image_rgb = _to_rgb_image(frame, photometric)
        metrics = _spectral_frame_metrics(image_rgb, y0)
        score = metrics["score"]
        if score > best_score:
            best_score = score
            best_index = frame_index
            best_image_rgb = image_rgb

    if best_image_rgb is None:
        best_index = window_end
        best_image_rgb = _to_rgb_image(_extract_frame(pixel_array, window_end, photometric), photometric)

    return best_image_rgb, {
        "selection_mode": selection_mode,
        "num_frames": frame_count,
        "prepass_stride": prepass_stride,
        "frame_window_start_index": window_start,
        "frame_window_end_index": window_end,
        "selected_frame_index": best_index,
        "selected_frame_score": round(float(best_score), 6) if np.isfinite(best_score) else None,
        "mature_start_index": mature_start_index,
    }
