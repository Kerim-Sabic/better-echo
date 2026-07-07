"""
Output-equivalence tests: every consumer must produce byte-identical results
whether it decodes directly or reads through the study frame cache.
"""

import numpy as np
import pydicom
import pytest
import torch
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from app.helpers.inference_runtime.inference_functions import (
    cached_panecho_tensor,
    pick_frames_from_local_dicom,
    stack_to_tensor,
)
from app.helpers.media import frame_cache as fc
from app.helpers.media.dicom_frame_reader import read_dicom_frames
from app.helpers.media.frame_cache import StudyFrameCache
from app.services.inference.linear_measurements.geometry import load_measurement_inputs
from app.services.inference.secondary_analysis_service import _stack_processed_dicoms
from app.services.inference.spectral_measurements.geometry import load_doppler_inputs


US_MULTIFRAME_SOP_CLASS = "1.2.840.10008.5.1.4.1.1.3.1"


def _write_cine(path, *, frames=8, rows=64, cols=64, seed=7) -> np.ndarray:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = US_MULTIFRAME_SOP_CLASS
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = FileDataset(str(path), {}, file_meta=meta, preamble=b"\0" * 128)
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    ds.SOPClassUID = US_MULTIFRAME_SOP_CLASS
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.Modality = "US"
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.SamplesPerPixel = 1
    ds.NumberOfFrames = frames
    ds.Rows = rows
    ds.Columns = cols
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.CineRate = 30

    rng = np.random.default_rng(seed)
    pixels = rng.integers(0, 255, size=(frames, rows, cols), dtype=np.uint8)
    ds.PixelData = pixels.tobytes()
    ds.save_as(str(path))
    return pixels


@pytest.fixture(autouse=True)
def _clean_registry():
    with fc._registry_lock:
        fc._open_caches.clear()
        fc._closed_totals.clear()
    yield
    with fc._registry_lock:
        fc._open_caches.clear()
        fc._closed_totals.clear()


@pytest.fixture()
def cine_path(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path)
    return str(path)


# Part 1. Motion segmentation reader (preserve-geometry and legacy modes).


@pytest.mark.parametrize("apply_mask", [False, True])
@pytest.mark.parametrize("preserve_geometry", [False, True])
def test_read_dicom_frames_cached_matches_direct(cine_path, apply_mask, preserve_geometry):
    direct_frames, direct_fps = read_dicom_frames(
        cine_path, apply_mask=apply_mask, preserve_geometry=preserve_geometry
    )
    cache = StudyFrameCache("study-1")
    cached_frames, cached_fps = read_dicom_frames(
        cine_path,
        apply_mask=apply_mask,
        preserve_geometry=preserve_geometry,
        cache=cache,
    )

    assert cached_fps == direct_fps
    assert len(cached_frames) == len(direct_frames)
    for direct, cached in zip(direct_frames, cached_frames):
        assert np.array_equal(direct, cached)


def test_read_dicom_frames_repeated_calls_hit_cache(cine_path):
    cache = StudyFrameCache("study-1")
    read_dicom_frames(cine_path, apply_mask=False, preserve_geometry=True, cache=cache)
    read_dicom_frames(cine_path, apply_mask=False, preserve_geometry=True, cache=cache)
    snap = cache.snapshot()
    assert snap["decode_misses"] == 1
    assert snap["derived_hits"] == 1


# Part 2. PanEcho (primary analysis) tensor path.


def test_panecho_tensor_cached_matches_direct(cine_path):
    direct = stack_to_tensor(pick_frames_from_local_dicom(cine_path, 16))
    cache = StudyFrameCache("study-1")
    cached = cached_panecho_tensor(cache, cine_path, 16)

    assert cached.device.type == "cpu"
    assert torch.equal(direct, cached)
    # A second consumer reuses the same tensor without re-preprocessing.
    again = cached_panecho_tensor(cache, cine_path, 16)
    assert again is cached


# Part 3. EchoPrime / view classifier clip path.


class _FakeEchoPrime:
    """Mimics EchoPrime preprocessing with call accounting."""

    def __init__(self):
        self.pixel_calls = 0
        self.file_calls = 0

    def process_pixel_array(self, raw_pixels, source="pixel_array"):
        self.pixel_calls += 1
        clip = torch.as_tensor(
            np.asarray(raw_pixels[:4], dtype=np.float32)
        ).unsqueeze(0)
        return clip.expand(3, -1, -1, -1).contiguous()

    def process_dicom_file(self, dicom_path):
        self.file_calls += 1
        ds = pydicom.dcmread(dicom_path)
        return self.process_pixel_array(ds.pixel_array, source=dicom_path)


def test_stack_processed_dicoms_deduplicates_via_cache(cine_path):
    ep = _FakeEchoPrime()
    cache = StudyFrameCache("study-1")

    # View classification pass, then EchoPrime metrics pass over same file.
    first_stack, first_paths = _stack_processed_dicoms(ep, [cine_path], cache=cache)
    second_stack, second_paths = _stack_processed_dicoms(ep, [cine_path], cache=cache)

    assert first_paths == second_paths == [cine_path]
    assert torch.equal(first_stack, second_stack)
    assert ep.pixel_calls == 1  # preprocessing ran exactly once
    assert ep.file_calls == 0  # no direct decode happened
    assert cache.snapshot()["decode_misses"] == 1


def test_stack_processed_dicoms_matches_uncached_output(cine_path):
    cached_ep = _FakeEchoPrime()
    direct_ep = _FakeEchoPrime()
    cache = StudyFrameCache("study-1")

    cached_stack, _ = _stack_processed_dicoms(cached_ep, [cine_path], cache=cache)
    direct_stack, _ = _stack_processed_dicoms(direct_ep, [cine_path], cache=None)

    assert torch.equal(cached_stack, direct_stack)
    assert direct_ep.file_calls == 1


def test_stack_processed_dicoms_falls_back_without_process_pixel_array(cine_path):
    class _LegacyEp:
        def __init__(self):
            self.file_calls = 0

        def process_dicom_file(self, _path):
            self.file_calls += 1
            return torch.zeros((3, 16, 224, 224), dtype=torch.float32)

    ep = _LegacyEp()
    cache = StudyFrameCache("study-1")
    stack, paths = _stack_processed_dicoms(ep, [cine_path], cache=cache)
    assert ep.file_calls == 1
    assert stack.shape[0] == 1
    assert paths == [cine_path]


# Part 4. Linear (2D) measurement inputs shared across weight runs.


def test_load_measurement_inputs_cached_matches_direct(cine_path):
    direct = load_measurement_inputs(cine_path)
    cache = StudyFrameCache("study-1")
    cached = load_measurement_inputs(cine_path, cache=cache)

    assert cached.fps == direct.fps
    assert cached.frame_width == direct.frame_width
    assert cached.frame_height == direct.frame_height
    assert cached.dicom_scale == direct.dicom_scale
    assert len(cached.source_frames_bgr) == len(direct.source_frames_bgr)
    for direct_frame, cached_frame in zip(direct.source_frames_bgr, cached.source_frames_bgr):
        assert np.array_equal(direct_frame, cached_frame)
    for direct_frame, cached_frame in zip(direct.model_frames_bgr, cached.model_frames_bgr):
        assert np.array_equal(direct_frame, cached_frame)


def test_load_measurement_inputs_shared_across_eight_weights(cine_path):
    cache = StudyFrameCache("study-1")
    results = [load_measurement_inputs(cine_path, cache=cache) for _ in range(8)]
    assert all(result is results[0] for result in results)
    snap = cache.snapshot()
    assert snap["decode_misses"] == 1
    assert snap["derived_misses"] == 1
    assert snap["derived_hits"] == 7


# Part 5. Spectral Doppler inputs shared across weight runs.


def test_load_doppler_inputs_cached_matches_direct(cine_path):
    region = {"y0": 10, "y1": 60, "x0": 0, "x1": 63, "region_type": "spectral"}
    direct = load_doppler_inputs(input_path=cine_path, region_override=region)
    cache = StudyFrameCache("study-1")
    cached = load_doppler_inputs(input_path=cine_path, region_override=region, cache=cache)

    assert np.array_equal(direct.image_rgb, cached.image_rgb)
    assert direct.frame_selection == cached.frame_selection
    assert direct.region == cached.region
    assert (direct.frame_width, direct.frame_height) == (
        cached.frame_width,
        cached.frame_height,
    )


def test_load_doppler_inputs_shared_across_weights(cine_path):
    region = {"y0": 10, "y1": 60, "x0": 0, "x1": 63, "region_type": "spectral"}
    cache = StudyFrameCache("study-1")
    results = [
        load_doppler_inputs(input_path=cine_path, region_override=region, cache=cache)
        for _ in range(5)
    ]
    assert all(result is results[0] for result in results)
    snap = cache.snapshot()
    assert snap["decode_misses"] == 1
    assert snap["derived_hits"] == 4


def test_load_doppler_inputs_region_overrides_have_distinct_recipes(cine_path):
    cache = StudyFrameCache("study-1")
    region_a = {"y0": 10}
    region_b = {"y0": 20}
    load_doppler_inputs(input_path=cine_path, region_override=region_a, cache=cache)
    load_doppler_inputs(input_path=cine_path, region_override=region_b, cache=cache)
    assert cache.snapshot()["derived_misses"] == 2
    # Same instance still decoded only once.
    assert cache.snapshot()["decode_misses"] == 1
