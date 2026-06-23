import numpy as np
import pytest

from app.helpers.media.mask_rle import (
    decode_rle_to_mask,
    empty_rle,
    encode_binary_mask_rle,
    rle_area,
)


def _roundtrip(mask: np.ndarray) -> np.ndarray:
    return decode_rle_to_mask(encode_binary_mask_rle(mask))


def test_roundtrip_empty_mask():
    mask = np.zeros((8, 5), dtype=np.uint8)
    rle = encode_binary_mask_rle(mask)
    assert rle["size"] == [8, 5]
    assert rle_area(rle) == 0
    np.testing.assert_array_equal(_roundtrip(mask), mask)


def test_roundtrip_full_mask():
    mask = np.ones((6, 7), dtype=np.uint8)
    rle = encode_binary_mask_rle(mask)
    assert rle["counts"][0] == 0
    assert rle_area(rle) == 42
    np.testing.assert_array_equal(_roundtrip(mask), mask)


def test_roundtrip_striped_and_blocky_masks():
    rng = np.random.default_rng(7)
    for shape in [(1, 1), (3, 3), (16, 9), (32, 41)]:
        for _ in range(5):
            mask = (rng.random(shape) > 0.5).astype(np.uint8)
            np.testing.assert_array_equal(_roundtrip(mask), mask)
            assert rle_area(encode_binary_mask_rle(mask)) == int(mask.sum())


def test_starts_with_foreground_pixel():
    mask = np.array([[1, 1, 0], [0, 1, 0]], dtype=np.uint8)
    rle = encode_binary_mask_rle(mask)
    assert rle["counts"][0] == 0
    np.testing.assert_array_equal(_roundtrip(mask), mask)


def test_row_major_ordering_is_preserved():
    mask = np.array([[1, 0, 0, 0], [0, 0, 0, 1]], dtype=np.uint8)
    decoded = _roundtrip(mask)
    assert decoded[0, 0] == 1
    assert decoded[1, 3] == 1
    assert decoded.sum() == 2


def test_truthy_nonbinary_input_is_normalized():
    mask = np.array([[0, 5], [255, 0]], dtype=np.uint8)
    decoded = _roundtrip(mask)
    expected = np.array([[0, 1], [1, 0]], dtype=np.uint8)
    np.testing.assert_array_equal(decoded, expected)


def test_empty_rle_helper_matches_zero_mask():
    rle = empty_rle(4, 4)
    expected = np.zeros((4, 4), dtype=np.uint8)
    np.testing.assert_array_equal(decode_rle_to_mask(rle), expected)


def test_decode_rejects_inconsistent_counts():
    with pytest.raises(ValueError):
        decode_rle_to_mask({"size": [2, 2], "counts": [1]})


def test_encode_rejects_non_2d():
    with pytest.raises(ValueError):
        encode_binary_mask_rle(np.zeros((2, 2, 3), dtype=np.uint8))
