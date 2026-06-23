from __future__ import annotations

import cv2
import numpy as np

PROB_THRESHOLD = 0.5
_MORPH_KERNEL = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))


def binarize_and_clean(
    prob_small: np.ndarray,
    frame_size: tuple[int, int],
) -> np.ndarray:
    """Convert a model probability map to a clean source-resolution mask."""
    mask_small = (prob_small > PROB_THRESHOLD).astype(np.uint8)
    mask_resized = cv2.resize(
        mask_small,
        frame_size,
        interpolation=cv2.INTER_NEAREST,
    )

    mask_binary = (mask_resized > 0).astype(np.uint8)
    mask_smooth = cv2.GaussianBlur(mask_binary * 255, (7, 7), 0)
    _, mask_binary = cv2.threshold(mask_smooth, 127, 1, cv2.THRESH_BINARY)
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
    return mask_binary.astype(np.uint8)


def foreground_confidence(prob_small: np.ndarray) -> float:
    """Return mean foreground probability, or 0.0 when no foreground exists."""
    foreground = prob_small > PROB_THRESHOLD
    if not foreground.any():
        return 0.0
    return float(prob_small[foreground].mean())


__all__ = [
    "PROB_THRESHOLD",
    "binarize_and_clean",
    "foreground_confidence",
]
