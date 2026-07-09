from __future__ import annotations

import cv2
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

PROB_THRESHOLD = 0.5
EDGE_SMOOTHING_METHOD = "probability_cubic_blur_largest_contour"
EDGE_SMOOTHING_VERSION = "v1"
_MORPH_KERNEL = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
_CONTOUR_SMOOTHING_WINDOW = 7


def _moving_average_closed_contour(points: np.ndarray) -> np.ndarray:
    if len(points) < _CONTOUR_SMOOTHING_WINDOW:
        return points

    radius = _CONTOUR_SMOOTHING_WINDOW // 2
    padded = np.vstack([points[-radius:], points, points[:radius]])
    # Vectorized equivalent of the per-point windowed mean: sliding_window_view
    # reduces over exactly the same window elements as the original loop, so the
    # smoothed coordinates are identical (same np.mean over the same values).
    windows = sliding_window_view(padded, window_shape=_CONTOUR_SMOOTHING_WINDOW, axis=0)
    return windows.mean(axis=-1).astype(np.float32)


def _rasterize_largest_smoothed_contour(mask_binary: np.ndarray) -> np.ndarray:
    if not mask_binary.any() or mask_binary.all():
        return mask_binary.astype(np.uint8)

    contours, _ = cv2.findContours(
        mask_binary,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_NONE,
    )
    if not contours:
        return mask_binary.astype(np.uint8)

    largest = max(contours, key=cv2.contourArea)
    if len(largest) < 4:
        return mask_binary.astype(np.uint8)

    height, width = mask_binary.shape
    points = largest.reshape(-1, 2).astype(np.float32)
    points = _moving_average_closed_contour(points)
    points[:, 0] = np.clip(np.rint(points[:, 0]), 0, width - 1)
    points[:, 1] = np.clip(np.rint(points[:, 1]), 0, height - 1)

    smoothed = np.zeros_like(mask_binary, dtype=np.uint8)
    cv2.fillPoly(smoothed, [points.astype(np.int32).reshape(-1, 1, 2)], 1)
    return smoothed


def binarize_and_clean(
    prob_small: np.ndarray,
    frame_size: tuple[int, int],
) -> np.ndarray:
    """Convert a model probability map to a clean source-resolution mask."""
    prob_resized = cv2.resize(
        prob_small.astype(np.float32),
        frame_size,
        interpolation=cv2.INTER_CUBIC,
    )

    prob_smooth = cv2.GaussianBlur(prob_resized, (5, 5), 0)
    mask_binary = (prob_smooth > PROB_THRESHOLD).astype(np.uint8)
    mask_binary = cv2.morphologyEx(
        mask_binary,
        cv2.MORPH_OPEN,
        _MORPH_KERNEL,
        iterations=1,
    )
    mask_binary = cv2.morphologyEx(
        mask_binary,
        cv2.MORPH_CLOSE,
        _MORPH_KERNEL,
        iterations=1,
    )
    return _rasterize_largest_smoothed_contour(mask_binary).astype(np.uint8)


def foreground_confidence(prob_small: np.ndarray) -> float:
    """Return mean foreground probability, or 0.0 when no foreground exists."""
    foreground = prob_small > PROB_THRESHOLD
    if not foreground.any():
        return 0.0
    return float(prob_small[foreground].mean())


__all__ = [
    "EDGE_SMOOTHING_METHOD",
    "EDGE_SMOOTHING_VERSION",
    "PROB_THRESHOLD",
    "binarize_and_clean",
    "foreground_confidence",
]
