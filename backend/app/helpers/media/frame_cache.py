"""
Per-study decoded DICOM frame cache shared by all analysis-pipeline consumers.

A `StudyFrameCache` holds two layers keyed by SOPInstanceUID (file-path
fallback when the header has no UID):

1. Decoded layer - the raw ``pydicom`` pixel array plus a header-only dataset,
   so every cine is decoded from disk exactly once per analysis job.
2. Derived layer - per-consumer preprocessed artifacts (EchoPrime clips,
   PanEcho tensors, measurement inputs, ...) keyed by ``(instance, recipe)``,
   so identical preprocessing never runs twice.

Caches are registered per study for the lifespan of one pipeline job via
`study_frame_cache_scope` and looked up by consumers with
`get_study_frame_cache`; callers outside a job simply get ``None`` and fall
back to direct decoding. All entries are single-flight: concurrent consumers
requesting the same key block on one computation. Stored values are CPU-only
(CUDA tensors are detached and copied off-device) and raw pixel arrays are
marked read-only, so cached data can never alias GPU memory or be mutated by
one consumer under another.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
import threading
from collections import OrderedDict
from contextlib import contextmanager
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any, Callable, Dict, Iterator, Optional, Tuple

import numpy as np
import pydicom

logger = logging.getLogger(__name__)

_DEFAULT_MAX_MB = 4096


def _settings():
    from app.core.config import settings

    return settings


def _cache_enabled() -> bool:
    try:
        return bool(getattr(_settings(), "FRAME_CACHE_ENABLED", True))
    except Exception:
        return True


def _configured_max_bytes() -> int:
    try:
        max_mb = int(getattr(_settings(), "FRAME_CACHE_MAX_MB", _DEFAULT_MAX_MB))
    except Exception:
        max_mb = _DEFAULT_MAX_MB
    return max(max_mb, 1) * 1024 * 1024


def dicom_fps(ds: Any) -> float:
    """Frame rate from CineRate, then FrameTime (ms), else 30 fps."""
    cine_rate = getattr(ds, "CineRate", None)
    frame_time = getattr(ds, "FrameTime", None)
    if isinstance(cine_rate, (int, float)) and cine_rate > 0:
        return float(cine_rate)
    if isinstance(frame_time, (int, float)) and frame_time > 0:
        return max(1.0, 1000.0 / float(frame_time))
    return 30.0


@dataclass(frozen=True)
class DecodedInstance:
    """One decoded DICOM instance: raw pixels plus header metadata."""

    key: str
    path: str
    sop_instance_uid: Optional[str]
    pixel_array: np.ndarray
    header: pydicom.Dataset
    photometric: str
    number_of_frames: int
    fps: float
    required_force: bool
    nbytes: int


class FrameCacheMetrics:
    """Thread-safe hit/miss counters for one study cache."""

    _FIELDS = (
        "decode_hits",
        "decode_misses",
        "derived_hits",
        "derived_misses",
        "evictions",
        "redecodes",
        "singleflight_waits",
    )

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counts: Dict[str, int] = {name: 0 for name in self._FIELDS}
        self.bytes_current = 0
        self.bytes_peak = 0
        self.decode_seconds = 0.0
        self.derived_seconds = 0.0

    def increment(self, name: str, amount: int = 1) -> None:
        with self._lock:
            self._counts[name] = self._counts.get(name, 0) + amount

    def add_bytes(self, delta: int) -> None:
        with self._lock:
            self.bytes_current += delta
            self.bytes_peak = max(self.bytes_peak, self.bytes_current)

    def add_seconds(self, name: str, seconds: float) -> None:
        with self._lock:
            if name == "decode":
                self.decode_seconds += seconds
            else:
                self.derived_seconds += seconds

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            counts = dict(self._counts)
            decode_total = counts["decode_hits"] + counts["decode_misses"]
            derived_total = counts["derived_hits"] + counts["derived_misses"]
            counts.update(
                {
                    "decode_hit_rate": (
                        counts["decode_hits"] / decode_total if decode_total else None
                    ),
                    "derived_hit_rate": (
                        counts["derived_hits"] / derived_total if derived_total else None
                    ),
                    "bytes_current": self.bytes_current,
                    "bytes_peak": self.bytes_peak,
                    "decode_seconds": round(self.decode_seconds, 3),
                    "derived_seconds": round(self.derived_seconds, 3),
                }
            )
            return counts


class _Cell:
    """Single-flight slot: first requester computes, the rest wait."""

    __slots__ = ("event", "value", "error", "nbytes")

    def __init__(self) -> None:
        self.event = threading.Event()
        self.value: Any = None
        self.error: Optional[BaseException] = None
        self.nbytes = 0


def _estimate_nbytes(obj: Any, _depth: int = 0) -> int:
    if obj is None or _depth > 4:
        return 0
    if isinstance(obj, np.ndarray):
        return int(obj.nbytes)
    try:
        import torch

        if isinstance(obj, torch.Tensor):
            return int(obj.element_size() * obj.nelement())
    except Exception:
        pass
    if isinstance(obj, (list, tuple, set)):
        return sum(_estimate_nbytes(item, _depth + 1) for item in obj)
    if isinstance(obj, dict):
        return sum(_estimate_nbytes(value, _depth + 1) for value in obj.values())
    inner = getattr(obj, "__dict__", None)
    if isinstance(inner, dict):
        return sum(_estimate_nbytes(value, _depth + 1) for value in inner.values())
    try:
        return int(sys.getsizeof(obj))
    except Exception:
        return 0


def _to_cpu(obj: Any, _depth: int = 0) -> Any:
    """Force torch tensors onto CPU so the cache never pins GPU memory."""
    if obj is None or _depth > 4:
        return obj
    try:
        import torch
    except Exception:
        return obj
    if isinstance(obj, torch.Tensor):
        tensor = obj.detach()
        if tensor.is_cuda:
            logger.warning(
                "[FRAME_CACHE] Derived recipe returned a CUDA tensor; copying to CPU"
            )
            tensor = tensor.cpu()
        return tensor
    if isinstance(obj, list):
        return [_to_cpu(item, _depth + 1) for item in obj]
    if isinstance(obj, tuple):
        return tuple(_to_cpu(item, _depth + 1) for item in obj)
    if isinstance(obj, dict):
        return {key: _to_cpu(value, _depth + 1) for key, value in obj.items()}
    return obj


class StudyFrameCache:
    """
    Job-lifetime decoded/derived frame cache for one study.

    Thread-safe; budget-capped with LRU eviction (evictions and forced
    re-decodes are counted rather than hidden).
    """

    def __init__(self, study_uid: str, max_bytes: Optional[int] = None) -> None:
        self.study_uid = study_uid
        self.max_bytes = int(max_bytes) if max_bytes else _configured_max_bytes()
        self.metrics = FrameCacheMetrics()
        self._lock = threading.RLock()
        self._cells: "OrderedDict[Tuple[str, ...], _Cell]" = OrderedDict()
        self._path_keys: Dict[str, str] = {}
        self._keys_decoded_before: set[str] = set()
        self._closed = False

    # Part 1. Instance identity: SOPInstanceUID with path fallback.
    def key_for_path(self, dicom_path: str) -> str:
        normalized = os.path.abspath(dicom_path)
        with self._lock:
            cached = self._path_keys.get(normalized)
        if cached:
            return cached
        key = normalized
        try:
            header = pydicom.dcmread(
                dicom_path, stop_before_pixels=True, force=True
            )
            sop_uid = str(getattr(header, "SOPInstanceUID", "") or "").strip()
            if sop_uid:
                key = sop_uid
        except Exception:
            pass
        with self._lock:
            self._path_keys[normalized] = key
        return key

    # Part 2. Decoded layer: read pixels from disk exactly once per instance.
    def get_decoded(self, dicom_path: str) -> DecodedInstance:
        key = self.key_for_path(dicom_path)

        def _decode() -> DecodedInstance:
            required_force = False
            try:
                ds = pydicom.dcmread(dicom_path)
            except Exception:
                ds = pydicom.dcmread(dicom_path, force=True)
                required_force = True
            pixel_array = ds.pixel_array
            try:
                pixel_array.flags.writeable = False
            except Exception:
                pass
            header = pydicom.dcmread(
                dicom_path, stop_before_pixels=True, force=True
            )
            declared_frames = getattr(header, "NumberOfFrames", None)
            try:
                number_of_frames = int(declared_frames)
            except Exception:
                number_of_frames = (
                    int(pixel_array.shape[0]) if pixel_array.ndim >= 3 else 1
                )
            return DecodedInstance(
                key=key,
                path=os.path.abspath(dicom_path),
                sop_instance_uid=str(
                    getattr(header, "SOPInstanceUID", "") or ""
                ).strip()
                or None,
                pixel_array=pixel_array,
                header=header,
                photometric=str(
                    getattr(header, "PhotometricInterpretation", "") or ""
                ).upper(),
                number_of_frames=number_of_frames,
                fps=dicom_fps(header),
                required_force=required_force,
                nbytes=int(pixel_array.nbytes),
            )

        return self._get_or_compute(("decoded", key), _decode, layer="decode")

    # Part 3. Derived layer: one preprocessed artifact per (instance, recipe).
    def get_derived(
        self,
        dicom_path: str,
        recipe: str,
        factory: Callable[[DecodedInstance], Any],
    ) -> Any:
        key = self.key_for_path(dicom_path)

        def _produce() -> Any:
            decoded = self.get_decoded(dicom_path)
            return _to_cpu(factory(decoded))

        return self._get_or_compute(("derived", key, recipe), _produce, layer="derived")

    # Part 4. Single-flight compute with LRU budget enforcement.
    def _get_or_compute(
        self,
        cell_key: Tuple[str, ...],
        producer: Callable[[], Any],
        *,
        layer: str,
    ) -> Any:
        hit_metric = f"{'decode' if layer == 'decode' else 'derived'}_hits"
        miss_metric = f"{'decode' if layer == 'decode' else 'derived'}_misses"

        while True:
            with self._lock:
                if self._closed:
                    raise RuntimeError(
                        f"StudyFrameCache for study {self.study_uid} is closed"
                    )
                cell = self._cells.get(cell_key)
                if cell is not None and cell.event.is_set() and cell.error is None:
                    self._cells.move_to_end(cell_key)
                    self.metrics.increment(hit_metric)
                    return cell.value
                if cell is None:
                    cell = _Cell()
                    self._cells[cell_key] = cell
                    self.metrics.increment(miss_metric)
                    if layer == "decode":
                        instance_key = cell_key[1]
                        if instance_key in self._keys_decoded_before:
                            self.metrics.increment("redecodes")
                        self._keys_decoded_before.add(instance_key)
                    owner = True
                else:
                    owner = False

            if not owner:
                self.metrics.increment("singleflight_waits")
                cell.event.wait()
                if cell.error is None:
                    self.metrics.increment(hit_metric)
                    return cell.value
                # Producer failed; loop to retry (failed cell was removed).
                continue

            started = perf_counter()
            try:
                value = producer()
            except BaseException as exc:
                with self._lock:
                    cell.error = exc
                    self._cells.pop(cell_key, None)
                cell.event.set()
                raise
            finally:
                self.metrics.add_seconds(
                    "decode" if layer == "decode" else "derived",
                    perf_counter() - started,
                )

            nbytes = _estimate_nbytes(value)
            with self._lock:
                cell.value = value
                cell.nbytes = nbytes
                self.metrics.add_bytes(nbytes)
                self._evict_over_budget(protect=cell_key)
            cell.event.set()
            return value

    def _evict_over_budget(self, *, protect: Tuple[str, ...]) -> None:
        # Caller holds self._lock.
        while self.metrics.bytes_current > self.max_bytes:
            evictable = next(
                (
                    key
                    for key, cell in self._cells.items()
                    if key != protect and cell.event.is_set() and cell.error is None
                ),
                None,
            )
            if evictable is None:
                return
            evicted = self._cells.pop(evictable)
            self.metrics.add_bytes(-evicted.nbytes)
            self.metrics.increment("evictions")

    def snapshot(self) -> Dict[str, Any]:
        data = self.metrics.snapshot()
        data["study_uid"] = self.study_uid
        data["max_bytes"] = self.max_bytes
        with self._lock:
            data["entries"] = len(self._cells)
        return data

    def close(self) -> Dict[str, Any]:
        final = self.snapshot()
        with self._lock:
            self._closed = True
            self._cells.clear()
            self._path_keys.clear()
        return final


# Part 5. Job-scoped registry: one refcounted cache per active study.
@dataclass
class _RegistryEntry:
    cache: StudyFrameCache
    refcount: int = 1


_registry_lock = threading.Lock()
_open_caches: Dict[str, _RegistryEntry] = {}
_closed_totals: Dict[str, Any] = {}


def open_study_frame_cache(study_uid: str) -> Optional[StudyFrameCache]:
    """Open (or join) the cache for a study; returns None when disabled."""
    if not study_uid or not _cache_enabled():
        return None
    with _registry_lock:
        entry = _open_caches.get(study_uid)
        if entry is not None:
            entry.refcount += 1
            return entry.cache
        cache = StudyFrameCache(study_uid)
        _open_caches[study_uid] = _RegistryEntry(cache=cache)
        logger.info(
            "[FRAME_CACHE] Opened study frame cache | study_uid=%s max_bytes=%d",
            study_uid,
            cache.max_bytes,
        )
        return cache


def get_study_frame_cache(study_uid: Optional[str]) -> Optional[StudyFrameCache]:
    """Return the active cache for a study, or None when no job has one open."""
    if not study_uid:
        return None
    with _registry_lock:
        entry = _open_caches.get(study_uid)
        return entry.cache if entry else None


def close_study_frame_cache(study_uid: str) -> Optional[Dict[str, Any]]:
    """Release one reference; frees the cache and logs metrics at zero."""
    if not study_uid:
        return None
    with _registry_lock:
        entry = _open_caches.get(study_uid)
        if entry is None:
            return None
        entry.refcount -= 1
        if entry.refcount > 0:
            return None
        del _open_caches[study_uid]
    final = entry.cache.close()
    _accumulate_closed_totals(final)
    logger.info(
        "[FRAME_CACHE] Closed study frame cache | study_uid=%s "
        "decode_hits=%d decode_misses=%d derived_hits=%d derived_misses=%d "
        "redecodes=%d evictions=%d bytes_peak=%d "
        "decode_seconds=%.3f derived_seconds=%.3f",
        study_uid,
        final["decode_hits"],
        final["decode_misses"],
        final["derived_hits"],
        final["derived_misses"],
        final["redecodes"],
        final["evictions"],
        final["bytes_peak"],
        final["decode_seconds"],
        final["derived_seconds"],
    )
    return final


def _accumulate_closed_totals(final: Dict[str, Any]) -> None:
    with _registry_lock:
        for name in (
            "decode_hits",
            "decode_misses",
            "derived_hits",
            "derived_misses",
            "evictions",
            "redecodes",
            "singleflight_waits",
        ):
            _closed_totals[name] = int(_closed_totals.get(name, 0)) + int(
                final.get(name, 0)
            )
        _closed_totals["closed_caches"] = int(_closed_totals.get("closed_caches", 0)) + 1


def global_frame_cache_metrics() -> Dict[str, Any]:
    """Aggregate metrics over closed caches plus currently open ones."""
    with _registry_lock:
        totals: Dict[str, Any] = dict(_closed_totals)
        open_snapshots = [entry.cache.snapshot() for entry in _open_caches.values()]
    totals.setdefault("closed_caches", 0)
    for snap in open_snapshots:
        for name in (
            "decode_hits",
            "decode_misses",
            "derived_hits",
            "derived_misses",
            "evictions",
            "redecodes",
            "singleflight_waits",
        ):
            totals[name] = int(totals.get(name, 0)) + int(snap.get(name, 0))
    totals["open_caches"] = len(open_snapshots)
    return totals


@contextmanager
def study_frame_cache_scope(study_uid: Optional[str]) -> Iterator[Optional[StudyFrameCache]]:
    """Hold a per-study cache open for the duration of one analysis job."""
    if not study_uid:
        yield None
        return
    cache = open_study_frame_cache(study_uid)
    try:
        yield cache
    finally:
        if cache is not None:
            close_study_frame_cache(study_uid)


__all__ = [
    "DecodedInstance",
    "FrameCacheMetrics",
    "StudyFrameCache",
    "close_study_frame_cache",
    "dicom_fps",
    "get_study_frame_cache",
    "global_frame_cache_metrics",
    "open_study_frame_cache",
    "study_frame_cache_scope",
]
