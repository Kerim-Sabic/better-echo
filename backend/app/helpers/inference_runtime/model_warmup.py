"""
One-shot warmup forwards for freshly loaded inference models.

With ``cudnn.benchmark`` enabled, the first forward pass at a given input shape
runs cuDNN's algorithm autotuner - visible in production logs as the first
study's opening batches running several times slower than steady state (e.g.
the 2D lane starting at ~6 fps before settling at ~50 fps). Running one dummy
forward at the production shape right after a model loads moves that cost to
load/preload time, off the clinical path. The same call also triggers
``torch.compile`` compilation when that is enabled.

Warmup is best-effort and CUDA-only: on CPU it is skipped (a dummy forward
there costs seconds and there is no autotuner to prime), and any failure is
logged and swallowed - a model that cannot warm up still serves.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Sequence

import torch

from app.helpers.inference_runtime import precision

logger = logging.getLogger(__name__)


def warmup_model(
    model: torch.nn.Module,
    input_shape: Sequence[int],
    device: Any,
    *,
    label: str = "model",
) -> None:
    """Run one throwaway forward at ``input_shape`` to prime cuDNN autotune."""
    dev = torch.device(device) if not isinstance(device, torch.device) else device
    if dev.type != "cuda" or not torch.cuda.is_available():
        return
    try:
        start = time.time()
        dummy = torch.zeros(*input_shape, device=dev)
        dummy = precision.as_channels_last(dummy, dev)
        with torch.no_grad(), precision.autocast(dev):
            model(dummy)
        torch.cuda.synchronize(dev)
        logger.info(
            "[Warmup] %s primed at shape %s in %.2fs",
            label,
            tuple(input_shape),
            time.time() - start,
        )
    except Exception as exc:  # pragma: no cover - warmup must never break a load
        logger.warning("[Warmup] %s warmup skipped: %s", label, exc)


__all__ = ["warmup_model"]
