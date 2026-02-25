import numpy as np
from typing import Optional

from app.helpers.doppler_frame_selection import select_doppler_frame


class FakeDicom:
    def __init__(self, pixel_array: np.ndarray, *, photometric: str, number_of_frames: Optional[int] = None):
        self.pixel_array = pixel_array
        self.PhotometricInterpretation = photometric
        if number_of_frames is not None:
            self.NumberOfFrames = number_of_frames


def test_select_image_for_inference_single_frame_rgb():
    frame = np.zeros((32, 32, 3), dtype=np.uint8)
    frame[20:24, 8:20, :] = 220
    ds = FakeDicom(frame, photometric="RGB")

    image_rgb, meta = select_doppler_frame(ds, y0=16)

    assert image_rgb.shape == (32, 32, 3)
    assert meta["selection_mode"] == "single_frame"
    assert meta["num_frames"] == 1
    assert meta["selected_frame_index"] == 0


def test_select_image_for_inference_uses_dynamic_mature_window_when_detected():
    frames = np.zeros((8, 40, 48, 3), dtype=np.uint8)
    # Build mature waveform-like signal starting at frame 2.
    for idx in range(2, 8):
        frames[idx, 18:38, 4:44, :] = 160
    # Make final mature frame strongest so it should be selected.
    frames[7, 16:38, 2:46, :] = 240
    ds = FakeDicom(frames, photometric="RGB", number_of_frames=8)

    _, meta = select_doppler_frame(ds, y0=18)

    assert meta["selection_mode"] == "dynamic_mature_window"
    assert meta["num_frames"] == 8
    assert meta["mature_start_index"] == 2
    assert meta["frame_window_start_index"] == 2
    assert meta["frame_window_end_index"] == 7
    assert meta["selected_frame_index"] == 7


def test_select_image_for_inference_falls_back_to_last_quarter_when_not_mature():
    frames = np.zeros((8, 40, 48, 3), dtype=np.uint8)
    # Sparse local traces that never form enough horizontal coverage.
    frames[1, 20:30, 10:16, :] = 180
    frames[3, 20:30, 16:22, :] = 180
    frames[5, 20:30, 22:28, :] = 180
    frames[7, 20:30, 28:34, :] = 200
    ds = FakeDicom(frames, photometric="RGB", number_of_frames=8)

    _, meta = select_doppler_frame(ds, y0=18)

    assert meta["selection_mode"] == "last_quarter_fallback"
    assert meta["num_frames"] == 8
    assert meta["mature_start_index"] is None
    assert meta["frame_window_start_index"] == 6
    assert meta["frame_window_end_index"] == 7
    assert meta["selected_frame_index"] in {6, 7}


def test_select_image_for_inference_multiframe_monochrome_outputs_rgb():
    frames = np.zeros((4, 24, 24), dtype=np.uint8)
    frames[3, 12:20, 4:20] = 255
    ds = FakeDicom(frames, photometric="MONOCHROME2", number_of_frames=4)

    image_rgb, meta = select_doppler_frame(ds, y0=10)

    assert image_rgb.shape == (24, 24, 3)
    assert meta["num_frames"] == 4
    assert meta["frame_window_start_index"] == 3
    assert meta["selected_frame_index"] == 3
