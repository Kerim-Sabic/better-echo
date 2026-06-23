from __future__ import annotations

from typing import Any

import numpy as np

RLE_FORMAT = "rle"
RLE_VERSION = "horalix-rle-v1"


def encode_binary_mask_rle(mask: np.ndarray) -> dict[str, Any]:
    """Encode a 2D binary mask into row-major RLE."""
    arr = np.asarray(mask)
    if arr.ndim != 2:
        raise ValueError(f"mask must be 2D, got shape {arr.shape}")

    binary = (arr > 0).astype(np.uint8)
    height, width = binary.shape
    flat = binary.reshape(-1)

    if flat.size == 0:
        return {"size": [int(height), int(width)], "counts": []}

    change_idx = np.flatnonzero(np.diff(flat)) + 1
    boundaries = np.concatenate(([0], change_idx, [flat.size]))
    counts = [int(count) for count in np.diff(boundaries).tolist()]

    if flat[0] == 1:
        counts.insert(0, 0)

    return {"size": [int(height), int(width)], "counts": counts}


def decode_rle_to_mask(rle: dict[str, Any]) -> np.ndarray:
    """Decode row-major RLE into a 2D uint8 mask."""
    size = rle.get("size") or [0, 0]
    height, width = int(size[0]), int(size[1])
    counts = rle.get("counts") or []

    flat = np.zeros(height * width, dtype=np.uint8)
    pos = 0
    value = 0
    for run in counts:
        run = int(run)
        if value == 1 and run > 0:
            flat[pos : pos + run] = 1
        pos += run
        value ^= 1

    if pos != height * width:
        raise ValueError(
            f"RLE counts sum ({pos}) does not match mask size ({height * width})"
        )

    return flat.reshape(height, width)


def rle_area(rle: dict[str, Any]) -> int:
    """Count foreground pixels without materializing the full mask."""
    return int(sum(int(count) for count in (rle.get("counts") or [])[1::2]))


def empty_rle(height: int, width: int) -> dict[str, Any]:
    """Return the RLE for an all-background mask."""
    total = int(height) * int(width)
    return {"size": [int(height), int(width)], "counts": [total] if total else []}


__all__ = [
    "RLE_FORMAT",
    "RLE_VERSION",
    "decode_rle_to_mask",
    "empty_rle",
    "encode_binary_mask_rle",
    "rle_area",
]
