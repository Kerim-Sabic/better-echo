import numpy as np

from app.helpers.media.mask_rle import decode_rle_to_mask, encode_binary_mask_rle
from app.services.inference.motion_segmentation.postprocess import (
    EDGE_SMOOTHING_METHOD,
    EDGE_SMOOTHING_VERSION,
    binarize_and_clean,
)


def test_smoothing_preserves_empty_mask():
    prob = np.zeros((112, 112), dtype=np.float32)

    mask = binarize_and_clean(prob, (80, 64))

    assert mask.shape == (64, 80)
    assert mask.dtype == np.uint8
    assert int(mask.sum()) == 0


def test_smoothing_preserves_full_mask():
    prob = np.ones((112, 112), dtype=np.float32)

    mask = binarize_and_clean(prob, (80, 64))

    assert mask.shape == (64, 80)
    assert mask.dtype == np.uint8
    assert int(mask.sum()) == 80 * 64


def test_smoothing_keeps_area_within_tolerance():
    prob = np.zeros((112, 112), dtype=np.float32)
    prob[28:84, 30:82] = 0.9
    prob[28:40, 30:44] = 0.0
    prob[70:84, 68:82] = 0.0

    mask = binarize_and_clean(prob, (224, 224))
    nearest_reference = np.zeros((224, 224), dtype=np.uint8)
    nearest_reference[56:168, 60:164] = 1
    nearest_reference[56:80, 60:88] = 0
    nearest_reference[140:168, 136:164] = 0

    reference_area = int(nearest_reference.sum())
    smoothed_area = int(mask.sum())

    assert mask.shape == (224, 224)
    assert mask.max() <= 1
    assert reference_area * 0.85 <= smoothed_area <= reference_area * 1.15


def test_smoothed_mask_rle_roundtrips():
    prob = np.zeros((112, 112), dtype=np.float32)
    prob[35:75, 35:75] = 0.95

    mask = binarize_and_clean(prob, (128, 96))
    decoded = decode_rle_to_mask(encode_binary_mask_rle(mask))

    np.testing.assert_array_equal(decoded, mask)


def test_smoothing_constants_are_persistable_metadata():
    assert EDGE_SMOOTHING_METHOD == "probability_cubic_blur_largest_contour"
    assert EDGE_SMOOTHING_VERSION == "v1"
