import contextlib
import logging
from typing import Callable

import torch

logger = logging.getLogger(__name__)


def has_min_vram(device: torch.device, required_gb: float) -> bool:
    """
    Check if the given CUDA device has at least required_gb free.
    Returns True for CPU or when CUDA is unavailable.
    """
    if device.type != "cuda" or not torch.cuda.is_available():
        return True
    try:
        free_bytes, total_bytes = torch.cuda.mem_get_info(device)
        free_gb = free_bytes / (1024**3)
        return free_gb >= required_gb
    except Exception:
        # If we cannot query, err on the side of attempting
        return True


def safe_preload(
    name: str,
    device: torch.device,
    required_gb: float,
    loader: Callable[[], None],
) -> bool:
    """
    Attempt to preload a model with basic OOM protection.
    - Skips preload if not enough free VRAM.
    - Catches OOM, clears cache, and returns False.
    """
    if not has_min_vram(device, required_gb):
        logger.warning("[%s] Skipping preload: insufficient free VRAM on %s", name, device)
        return False

    try:
        loader()
        logger.info("[%s] Preload succeeded on %s", name, device)
        return True
    except RuntimeError as err:
        if "out of memory" in str(err).lower():
            logger.warning("[%s] OOM during preload on %s; skipping", name, device)
        else:
            logger.warning("[%s] Preload failed on %s: %s", name, device, err)
    except Exception as err:
        logger.warning("[%s] Preload failed on %s: %s", name, device, err)
    finally:
        if device.type == "cuda":
            with contextlib.suppress(Exception):
                torch.cuda.empty_cache()
    return False
