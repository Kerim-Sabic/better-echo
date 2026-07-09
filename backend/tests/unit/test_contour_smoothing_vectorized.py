import numpy as np

from app.services.inference.motion_segmentation.postprocess import (
    _CONTOUR_SMOOTHING_WINDOW,
    _moving_average_closed_contour,
)


def _original_moving_average(points: np.ndarray) -> np.ndarray:
    """Verbatim pre-optimization per-point loop, as a parity reference."""
    window = _CONTOUR_SMOOTHING_WINDOW
    if len(points) < window:
        return points
    radius = window // 2
    padded = np.vstack([points[-radius:], points, points[:radius]])
    smoothed = np.empty_like(points, dtype=np.float32)
    for index in range(len(points)):
        smoothed[index] = padded[index : index + window].mean(axis=0)
    return smoothed


def test_vectorized_matches_loop_bit_for_bit():
    rng = np.random.default_rng(0)
    for n in (7, 10, 25, 60, 137, 400):
        pts = (rng.random((n, 2)) * 300).astype(np.float32)
        expected = _original_moving_average(pts)
        actual = _moving_average_closed_contour(pts)
        assert actual.shape == expected.shape
        assert np.array_equal(actual, expected)


def test_short_contour_returned_unchanged():
    pts = np.arange(8, dtype=np.float32).reshape(4, 2)
    out = _moving_average_closed_contour(pts)
    assert np.array_equal(out, pts)


def test_output_is_float32():
    rng = np.random.default_rng(1)
    pts = (rng.random((30, 2)) * 100).astype(np.float32)
    assert _moving_average_closed_contour(pts).dtype == np.float32
