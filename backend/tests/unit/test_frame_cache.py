import threading
import time

import numpy as np
import pydicom
import pytest
import torch
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from app.core.config import settings
from app.helpers.media import frame_cache as fc
from app.helpers.media.frame_cache import (
    StudyFrameCache,
    close_study_frame_cache,
    get_study_frame_cache,
    global_frame_cache_metrics,
    open_study_frame_cache,
    study_frame_cache_scope,
)


US_MULTIFRAME_SOP_CLASS = "1.2.840.10008.5.1.4.1.1.3.1"


def _write_cine(
    path,
    *,
    frames: int = 8,
    rows: int = 64,
    cols: int = 64,
    sop_uid: str | None = None,
    seed: int = 7,
) -> np.ndarray:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = US_MULTIFRAME_SOP_CLASS
    meta.MediaStorageSOPInstanceUID = sop_uid or generate_uid()
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


# Part 1. Decode layer behavior.


def test_each_cine_decoded_exactly_once(tmp_path, monkeypatch):
    path = tmp_path / "cine.dcm"
    expected = _write_cine(path)

    full_decodes = {"count": 0}
    original_dcmread = pydicom.dcmread

    def counting_dcmread(*args, **kwargs):
        if not kwargs.get("stop_before_pixels"):
            full_decodes["count"] += 1
        return original_dcmread(*args, **kwargs)

    monkeypatch.setattr(fc.pydicom, "dcmread", counting_dcmread)

    cache = StudyFrameCache("study-1")
    for _ in range(5):
        decoded = cache.get_decoded(str(path))
        assert np.array_equal(decoded.pixel_array, expected)

    assert full_decodes["count"] == 1
    snap = cache.snapshot()
    assert snap["decode_misses"] == 1
    assert snap["decode_hits"] == 4
    assert snap["redecodes"] == 0


def test_sop_uid_keying_unifies_path_aliases(tmp_path):
    sop_uid = generate_uid()
    path_a = tmp_path / "upload.dcm"
    path_b = tmp_path / "orthanc_download.dcm"
    _write_cine(path_a, sop_uid=sop_uid)
    path_b.write_bytes(path_a.read_bytes())

    cache = StudyFrameCache("study-1")
    decoded_a = cache.get_decoded(str(path_a))
    decoded_b = cache.get_decoded(str(path_b))

    assert decoded_a is decoded_b
    assert decoded_a.sop_instance_uid == sop_uid
    snap = cache.snapshot()
    assert snap["decode_misses"] == 1
    assert snap["decode_hits"] == 1


def test_raw_pixels_are_read_only(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path)
    cache = StudyFrameCache("study-1")
    decoded = cache.get_decoded(str(path))
    with pytest.raises(ValueError):
        decoded.pixel_array[0, 0, 0] = 1


def test_decoded_metadata_matches_header(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path, frames=6)
    cache = StudyFrameCache("study-1")
    decoded = cache.get_decoded(str(path))
    assert decoded.number_of_frames == 6
    assert decoded.photometric == "MONOCHROME2"
    assert decoded.fps == 30.0
    assert decoded.required_force is False


# Part 2. Derived layer behavior.


def test_derived_recipe_runs_once_across_consumers(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path)
    cache = StudyFrameCache("study-1")

    calls = {"count": 0}

    def factory(decoded):
        calls["count"] += 1
        return decoded.pixel_array.astype(np.float32) * 0.5

    results = [cache.get_derived(str(path), "recipe_x", factory) for _ in range(8)]
    assert calls["count"] == 1
    assert all(result is results[0] for result in results)
    snap = cache.snapshot()
    assert snap["derived_misses"] == 1
    assert snap["derived_hits"] == 7


def test_distinct_recipes_do_not_collide(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path)
    cache = StudyFrameCache("study-1")

    first = cache.get_derived(str(path), "recipe_a", lambda d: "a")
    second = cache.get_derived(str(path), "recipe_b", lambda d: "b")
    assert (first, second) == ("a", "b")
    assert cache.snapshot()["derived_misses"] == 2


def test_none_results_are_cached(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path)
    cache = StudyFrameCache("study-1")

    calls = {"count": 0}

    def factory(_decoded):
        calls["count"] += 1
        return None

    assert cache.get_derived(str(path), "incompatible", factory) is None
    assert cache.get_derived(str(path), "incompatible", factory) is None
    assert calls["count"] == 1


def test_factory_errors_are_not_cached(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path)
    cache = StudyFrameCache("study-1")

    attempts = {"count": 0}

    def flaky(_decoded):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("boom")
        return "ok"

    with pytest.raises(RuntimeError):
        cache.get_derived(str(path), "flaky", flaky)
    assert cache.get_derived(str(path), "flaky", flaky) == "ok"
    assert attempts["count"] == 2


# Part 3. Concurrency: multiple simultaneous consumers, single flight.


def test_concurrent_consumers_share_one_computation(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path)
    cache = StudyFrameCache("study-1")

    calls = {"count": 0}
    barrier = threading.Barrier(8)
    results = []
    errors = []

    def factory(decoded):
        calls["count"] += 1
        time.sleep(0.1)
        return decoded.pixel_array.sum()

    def worker():
        try:
            barrier.wait(timeout=5)
            results.append(cache.get_derived(str(path), "shared", factory))
        except Exception as exc:  # pragma: no cover - failure reporting
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert not errors
    assert calls["count"] == 1
    assert len(set(results)) == 1
    snap = cache.snapshot()
    assert snap["decode_misses"] == 1
    assert snap["singleflight_waits"] >= 1


# Part 4. Memory budget and eviction accounting.


def test_lru_eviction_counts_redecodes(tmp_path):
    path_a = tmp_path / "a.dcm"
    path_b = tmp_path / "b.dcm"
    _write_cine(path_a, frames=4, seed=1)
    _write_cine(path_b, frames=4, seed=2)

    # Budget fits one decoded cine (4*64*64 = 16 KiB) but not two.
    cache = StudyFrameCache("study-1", max_bytes=20 * 1024)
    cache.get_decoded(str(path_a))
    cache.get_decoded(str(path_b))  # evicts A
    cache.get_decoded(str(path_a))  # forced re-decode

    snap = cache.snapshot()
    assert snap["evictions"] >= 1
    assert snap["redecodes"] == 1
    assert snap["bytes_current"] <= cache.max_bytes


# Part 5. GPU safety.


def test_cached_tensors_are_cpu_and_detached(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path)
    cache = StudyFrameCache("study-1")

    def factory(decoded):
        tensor = torch.ones((2, 2), requires_grad=True) * 2
        return tensor

    result = cache.get_derived(str(path), "tensor", factory)
    assert isinstance(result, torch.Tensor)
    assert result.device.type == "cpu"
    assert result.requires_grad is False


def test_cached_tensor_containers_are_sanitized(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path)
    cache = StudyFrameCache("study-1")

    result = cache.get_derived(
        str(path),
        "tensor_list",
        lambda d: [torch.zeros(3, requires_grad=True), {"x": torch.ones(2)}],
    )
    assert result[0].requires_grad is False
    assert result[1]["x"].device.type == "cpu"


# Part 6. Registry lifecycle: cache lifespan == analysis job lifespan.


def test_registry_refcount_and_lifespan():
    cache = open_study_frame_cache("study-42")
    assert cache is not None
    joined = open_study_frame_cache("study-42")
    assert joined is cache
    assert get_study_frame_cache("study-42") is cache

    assert close_study_frame_cache("study-42") is None  # still one holder
    assert get_study_frame_cache("study-42") is cache

    final = close_study_frame_cache("study-42")
    assert isinstance(final, dict)
    assert get_study_frame_cache("study-42") is None


def test_scope_context_manager_opens_and_closes():
    with study_frame_cache_scope("study-77") as cache:
        assert cache is not None
        assert get_study_frame_cache("study-77") is cache
    assert get_study_frame_cache("study-77") is None


def test_scope_disabled_by_setting(monkeypatch):
    monkeypatch.setattr(settings, "FRAME_CACHE_ENABLED", False)
    with study_frame_cache_scope("study-88") as cache:
        assert cache is None
        assert get_study_frame_cache("study-88") is None


def test_closed_cache_rejects_use(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path)
    cache = StudyFrameCache("study-1")
    cache.close()
    with pytest.raises(RuntimeError):
        cache.get_decoded(str(path))


def test_global_metrics_aggregate_open_and_closed(tmp_path):
    path = tmp_path / "cine.dcm"
    _write_cine(path)

    with study_frame_cache_scope("study-a") as cache:
        cache.get_decoded(str(path))
        cache.get_decoded(str(path))

    open_cache = open_study_frame_cache("study-b")
    open_cache.get_decoded(str(path))

    totals = global_frame_cache_metrics()
    assert totals["closed_caches"] == 1
    assert totals["open_caches"] == 1
    assert totals["decode_misses"] == 2
    assert totals["decode_hits"] == 1
    close_study_frame_cache("study-b")
