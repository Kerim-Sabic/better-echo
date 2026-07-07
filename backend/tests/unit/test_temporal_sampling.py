import numpy as np
import pytest

from app.helpers.inference_runtime.temporal_sampling import (
    interpolate_confidences,
    interpolate_keypoints,
    max_point_error_px,
    passes_self_check,
    pick_self_check_indices,
    plan_temporal_sampling,
)


def test_stride_one_infers_every_frame():
    plan = plan_temporal_sampling(total=10, stride=1)
    assert plan.inferred_indices == list(range(10))
    assert plan.enabled is False
    assert plan.skipped_indices == []


def test_stride_two_anchors_first_and_last_frame():
    plan = plan_temporal_sampling(total=8, stride=2)
    # 0,2,4,6 then last (7) appended because 6 != 7
    assert plan.inferred_indices == [0, 2, 4, 6, 7]
    assert plan.enabled is True
    assert plan.skipped_indices == [1, 3, 5]


def test_stride_two_even_last_frame_not_duplicated():
    plan = plan_temporal_sampling(total=9, stride=2)
    # 0,2,4,6,8 -> last already 8
    assert plan.inferred_indices == [0, 2, 4, 6, 8]
    assert plan.skipped_indices == [1, 3, 5, 7]


def test_tiny_clip_never_subsamples():
    for total in (0, 1, 2):
        plan = plan_temporal_sampling(total=total, stride=2)
        assert plan.enabled is False
        assert plan.inferred_indices == list(range(total))


def test_interpolation_reproduces_inferred_frames_exactly():
    total = 5
    inferred_indices = [0, 2, 4]
    # (N, K=2, D=2)
    inferred = np.array(
        [
            [[0.0, 0.0], [10.0, 10.0]],
            [[2.0, 4.0], [12.0, 6.0]],
            [[4.0, 8.0], [14.0, 2.0]],
        ],
        dtype=np.float32,
    )
    full = interpolate_keypoints(inferred_indices, inferred, total)
    assert full.shape == (5, 2, 2)
    # inferred frames are exact
    np.testing.assert_allclose(full[0], inferred[0])
    np.testing.assert_allclose(full[2], inferred[1])
    np.testing.assert_allclose(full[4], inferred[2])
    # skipped frame 1 is midpoint of frames 0 and 2
    np.testing.assert_allclose(full[1], (inferred[0] + inferred[1]) / 2.0)
    np.testing.assert_allclose(full[3], (inferred[1] + inferred[2]) / 2.0)


def test_linear_motion_is_reconstructed_without_error():
    # A keypoint moving linearly is perfectly recovered by interpolation.
    total = 11
    frames = np.arange(total)
    coords = np.stack(
        [np.stack([frames * 1.0, frames * 2.0], axis=-1)], axis=1
    ).astype(np.float32)  # (T, 1, 2)
    inferred_indices = [0, 2, 4, 6, 8, 10]
    full = interpolate_keypoints(inferred_indices, coords[inferred_indices], total)
    np.testing.assert_allclose(full, coords, atol=1e-5)


def test_confidence_interpolation_shape_and_values():
    conf = interpolate_confidences([0, 2], np.array([[1.0, 0.0], [0.0, 1.0]], np.float32), 3)
    assert conf.shape == (3, 2)
    np.testing.assert_allclose(conf[1], [0.5, 0.5])


def test_self_check_pass_and_fail():
    plan = plan_temporal_sampling(total=20, stride=2)
    picks = pick_self_check_indices(plan, max_samples=3)
    assert 0 < len(picks) <= 3
    assert all(p in plan.skipped_indices for p in picks)

    interp = np.zeros((3, 2, 2), dtype=np.float32)
    actual_close = interp + 0.5
    actual_far = interp + 5.0
    passed, err = passes_self_check(interp, actual_close, max_point_error_px_threshold=2.0)
    assert passed is True
    assert err == pytest.approx(np.sqrt(0.5))

    passed, err = passes_self_check(interp, actual_far, max_point_error_px_threshold=2.0)
    assert passed is False


def test_max_point_error_shape_guard():
    with pytest.raises(ValueError):
        max_point_error_px(np.zeros((2, 2, 2)), np.zeros((3, 2, 2)))
