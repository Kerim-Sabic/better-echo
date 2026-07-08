"""
CPU/GPU overlap helpers for the inference pipeline.

The pipeline lanes historically alternated strictly between CPU work (DICOM
decode + preprocessing, per-frame postprocessing) and GPU work (model forward
passes), leaving each side idle while the other ran. These helpers overlap the
two without changing any output:

* ``iter_with_prefetch`` - produce item *k+1* on a background thread while the
  consumer (typically a GPU loop) processes item *k*. Results are yielded
  strictly in order and worker exceptions surface at the consuming call site,
  so control flow is identical to the sequential loop.
* ``map_ordered_submit`` - fan per-item CPU postprocessing out to a small
  thread pool while the producing loop (typically a GPU batch generator) keeps
  running, then collect results in input order.

Both honor the ``INFERENCE_CPU_GPU_OVERLAP`` setting; when disabled they run
the plain sequential equivalent, which is also the path taken for trivially
small inputs.
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Iterable, Iterator, List, Sequence, TypeVar

T = TypeVar("T")
R = TypeVar("R")


def overlap_enabled() -> bool:
    try:
        from app.core.config import settings

        return bool(getattr(settings, "INFERENCE_CPU_GPU_OVERLAP", True))
    except Exception:
        return True


def postprocess_workers() -> int:
    """
    Thread count for overlapping per-frame CPU postprocess with GPU batches.

    Returns 1 (sequential) when overlap is disabled. Otherwise reads
    ``INFERENCE_POSTPROCESS_WORKERS`` (0/unset => a small CPU-bound default).
    """
    if not overlap_enabled():
        return 1
    try:
        from app.core.config import settings

        configured = int(getattr(settings, "INFERENCE_POSTPROCESS_WORKERS", 0) or 0)
    except Exception:
        configured = 0
    if configured > 0:
        return configured
    return max(1, min(4, (os.cpu_count() or 2)))


def iter_with_prefetch(
    items: Sequence[T],
    produce: Callable[[T], R],
    *,
    enabled: bool | None = None,
) -> Iterator[R]:
    """
    Yield ``produce(item)`` for each item in order, computing the next item's
    result on a background thread while the caller consumes the current one.

    With one item (or when disabled) this degenerates to a plain loop. A
    ``produce`` exception is raised at the yield point for that item, exactly
    where the sequential loop would have raised it.
    """
    items = list(items)
    if enabled is None:
        enabled = overlap_enabled()
    if not enabled or len(items) <= 1:
        for item in items:
            yield produce(item)
        return

    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="inference-prefetch") as pool:
        future = pool.submit(produce, items[0])
        for index in range(len(items)):
            value = future.result()
            if index + 1 < len(items):
                future = pool.submit(produce, items[index + 1])
            yield value


def map_ordered_submit(
    producer: Iterable[T],
    handle: Callable[[T], R],
    *,
    max_workers: int,
    enabled: bool | None = None,
) -> List[R]:
    """
    Apply ``handle`` to every item from ``producer``, submitting items to a
    thread pool as the producer yields them so production (e.g. GPU batches)
    and handling (e.g. per-frame postprocess) overlap. Results are returned in
    production order; the first worker exception propagates.
    """
    if enabled is None:
        enabled = overlap_enabled()
    if not enabled or max_workers <= 1:
        return [handle(item) for item in producer]

    with ThreadPoolExecutor(
        max_workers=max_workers, thread_name_prefix="inference-postprocess"
    ) as pool:
        futures = [pool.submit(handle, item) for item in producer]
        return [future.result() for future in futures]


__all__ = ["iter_with_prefetch", "map_ordered_submit", "overlap_enabled"]
