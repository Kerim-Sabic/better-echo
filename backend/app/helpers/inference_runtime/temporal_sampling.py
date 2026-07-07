"""
Temporal subsampling + interpolation for per-frame keypoint estimation.

The 2D linear-measurement lane runs a keypoint model on every frame of a cine.
Cardiac motion is smooth between adjacent frames, so keypoint trajectories can
often be reconstructed by inferring every N-th frame and linearly interpolating
the skipped ones - roughly halving compute at stride 2.

This module holds only the *pure* pieces (index selection, interpolation, and
the self-gate error math) so they are unit-testable on CPU without a model or
GPU. The service layer supplies a callable that actually runs the model on a set
of indices. Because changing the sampled frame set changes clinical outputs, the
feature is off by default (``LINEAR_TEMPORAL_STRIDE = 1``) and, when enabled,
guarded at runtime by ``passes_self_check`` and offline by the parity harness.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence

import numpy as np


@dataclass(frozen=True)
class TemporalPlan:
    total: int
    stride: int
    inferred_indices: List[int]

    @property
    def skipped_indices(self) -> List[int]:
        inferred = set(self.inferred_indices)
        return [i for i in range(self.total) if i not in inferred]

    @property
    def enabled(self) -> bool:
        return self.stride > 1 and len(self.inferred_indices) < self.total


def plan_temporal_sampling(total: int, stride: int) -> TemporalPlan:
    """
    Choose which frame indices to actually infer.

    Always includes the first and last frame so interpolation only ever fills
    *between* anchored endpoints (never extrapolates past the last inferred
    frame). With ``stride <= 1`` every frame is inferred (feature disabled).
    """
    total = int(total)
    stride = max(1, int(stride))
    if total <= 0:
        return TemporalPlan(total=total, stride=stride, inferred_indices=[])
    if stride <= 1 or total <= 2:
        return TemporalPlan(total=total, stride=1, inferred_indices=list(range(total)))
    indices = list(range(0, total, stride))
    if indices[-1] != total - 1:
        indices.append(total - 1)
    return TemporalPlan(total=total, stride=stride, inferred_indices=indices)


def interpolate_keypoints(
    inferred_indices: Sequence[int],
    inferred_coords: np.ndarray,
    total: int,
) -> np.ndarray:
    """
    Linearly interpolate keypoint coordinates onto every frame index.

    ``inferred_coords`` has shape ``(len(inferred_indices), K, D)`` (K keypoints,
    D coordinate dims). Returns ``(total, K, D)``. Frames at inferred indices
    reproduce their exact inferred values; skipped frames are the straight-line
    interpolation of the surrounding inferred frames.
    """
    inferred_indices = list(inferred_indices)
    inferred_coords = np.asarray(inferred_coords, dtype=np.float32)
    if inferred_coords.ndim != 3:
        raise ValueError("inferred_coords must have shape (N, K, D)")
    if len(inferred_indices) != inferred_coords.shape[0]:
        raise ValueError("inferred_indices length must match inferred_coords")

    n_keypoints, n_dims = inferred_coords.shape[1], inferred_coords.shape[2]
    full = np.empty((total, n_keypoints, n_dims), dtype=np.float32)
    xs = np.asarray(inferred_indices, dtype=np.float64)
    target = np.arange(total, dtype=np.float64)
    for k in range(n_keypoints):
        for d in range(n_dims):
            full[:, k, d] = np.interp(target, xs, inferred_coords[:, k, d]).astype(np.float32)
    return full


def interpolate_confidences(
    inferred_indices: Sequence[int],
    inferred_confidences: np.ndarray,
    total: int,
) -> np.ndarray:
    """Linearly interpolate per-keypoint confidences onto every frame index."""
    inferred_indices = list(inferred_indices)
    inferred_confidences = np.asarray(inferred_confidences, dtype=np.float32)
    if inferred_confidences.ndim != 2:
        raise ValueError("inferred_confidences must have shape (N, K)")
    n_keypoints = inferred_confidences.shape[1]
    full = np.empty((total, n_keypoints), dtype=np.float32)
    xs = np.asarray(inferred_indices, dtype=np.float64)
    target = np.arange(total, dtype=np.float64)
    for k in range(n_keypoints):
        full[:, k] = np.interp(target, xs, inferred_confidences[:, k]).astype(np.float32)
    return full


def pick_self_check_indices(plan: TemporalPlan, max_samples: int) -> List[int]:
    """
    Choose up to ``max_samples`` skipped frames, spread across the clip, to
    verify interpolation against real inference at runtime.
    """
    skipped = plan.skipped_indices
    if not skipped or max_samples <= 0:
        return []
    if len(skipped) <= max_samples:
        return skipped
    positions = np.linspace(0, len(skipped) - 1, max_samples)
    chosen = sorted({skipped[int(round(p))] for p in positions})
    return chosen


def max_point_error_px(interpolated: np.ndarray, actual: np.ndarray) -> float:
    """
    Worst-case per-keypoint Euclidean error (in input-tensor pixels) between
    interpolated and actually-inferred coordinates. Both are ``(M, K, D)``.
    """
    interpolated = np.asarray(interpolated, dtype=np.float64)
    actual = np.asarray(actual, dtype=np.float64)
    if interpolated.shape != actual.shape:
        raise ValueError("shape mismatch between interpolated and actual coords")
    if interpolated.size == 0:
        return 0.0
    per_point = np.linalg.norm(interpolated - actual, axis=-1)
    return float(np.max(per_point))


def passes_self_check(
    interpolated_at_checks: np.ndarray,
    actual_at_checks: np.ndarray,
    max_point_error_px_threshold: float,
) -> tuple[bool, float]:
    """
    Return ``(passed, observed_max_error_px)``. ``passed`` is False when the
    interpolation error on the spot-checked skipped frames exceeds the
    threshold, telling the caller to fall back to full every-frame inference.
    """
    observed = max_point_error_px(interpolated_at_checks, actual_at_checks)
    return observed <= float(max_point_error_px_threshold), observed


__all__ = [
    "TemporalPlan",
    "interpolate_confidences",
    "interpolate_keypoints",
    "max_point_error_px",
    "passes_self_check",
    "pick_self_check_indices",
    "plan_temporal_sampling",
]
