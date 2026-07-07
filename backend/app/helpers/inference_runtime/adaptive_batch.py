"""
OOM-aware adaptive batching for GPU inference loops.

Raising a batch size (e.g. motion segmentation 16 -> 64) is only safe if an
occasional out-of-memory does not abort the whole study. ``run_adaptive_batches``
drives a batched loop that, on a CUDA OOM, empties the allocator cache, halves
the batch size, and retries the *same* slice - so throughput stays high on GPUs
with headroom while smaller GPUs quietly degrade to a batch that fits instead of
failing the request.

The helper is a generator that yields ``(start, end, result)`` in order, which
keeps the existing streaming / per-frame logging behaviour of the callers
intact. On CPU (or if OOM persists at ``min_batch_size``) the error propagates
unchanged so the existing device fallback logic still runs.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Iterator, Tuple

import torch

logger = logging.getLogger(__name__)


def is_cuda_oom(exc: BaseException) -> bool:
    """True for CUDA out-of-memory errors across torch versions."""
    oom_type = getattr(torch.cuda, "OutOfMemoryError", None)
    if oom_type is not None and isinstance(exc, oom_type):
        return True
    if isinstance(exc, RuntimeError) and "out of memory" in str(exc).lower():
        return True
    return False


def _empty_cache() -> None:
    try:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:  # pragma: no cover - defensive
        pass


def run_adaptive_batches(
    total: int,
    initial_batch_size: int,
    run_batch: Callable[[int, int], Any],
    *,
    device: torch.device,
    min_batch_size: int = 1,
    label: str = "inference",
) -> Iterator[Tuple[int, int, Any]]:
    """
    Drive ``run_batch(start, end)`` over ``range(total)`` in adaptive chunks.

    Yields ``(start, end, result)`` for each successful chunk, in order.
    On a CUDA OOM the batch size is halved (down to ``min_batch_size``) and the
    failing slice is retried. Non-OOM errors, and OOM at the minimum batch size,
    propagate to the caller.
    """
    batch_size = max(1, int(initial_batch_size))
    min_batch_size = max(1, int(min_batch_size))
    is_cuda = device.type == "cuda"
    position = 0

    while position < total:
        end = min(position + batch_size, total)
        try:
            result = run_batch(position, end)
        except BaseException as exc:  # noqa: BLE001 - re-raised unless CUDA OOM
            if not (is_cuda and is_cuda_oom(exc) and batch_size > min_batch_size):
                raise
            _empty_cache()
            new_batch_size = max(min_batch_size, batch_size // 2)
            logger.warning(
                "[AdaptiveBatch] %s hit CUDA OOM at batch=%d; retrying slice "
                "[%d:%d] with batch=%d",
                label,
                batch_size,
                position,
                end,
                new_batch_size,
            )
            batch_size = new_batch_size
            continue
        yield position, end, result
        position = end


__all__ = ["is_cuda_oom", "run_adaptive_batches"]
