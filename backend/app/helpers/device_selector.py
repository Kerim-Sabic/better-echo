import logging
from typing import Optional

import torch

from app.core.config import settings
logger = logging.getLogger(__name__)


def _normalize_pref(value: Optional[str]) -> str:
    if not value:
        return "auto"
    return value.strip().lower()


def _device_from_pref(pref: str) -> torch.device:
    pref = _normalize_pref(pref)

    if pref == "cpu" or not torch.cuda.is_available():
        return torch.device("cpu")

    # auto / cuda / cuda:auto -> prefer GPU 0
    if pref in {"auto", "cuda", "cuda:auto"}:
        return torch.device("cuda:0")

    if pref.startswith("cuda:"):
        try:
            idx = int(pref.split(":", 1)[1])
            if idx < torch.cuda.device_count():
                return torch.device(f"cuda:{idx}")
        except ValueError:
            pass

    logger.warning("Invalid or unavailable device pref '%s', falling back to CPU", pref)
    return torch.device("cpu")


def _avoid_reserved(device: torch.device) -> torch.device:
    reserved = _normalize_pref(settings.RESERVED_LLM_DEVICE) if settings.RESERVED_LLM_DEVICE else None
    if not reserved or device.type != "cuda":
        return device
    if device.type == "cuda" and device.index is not None:
        if reserved == f"cuda:{device.index}" or reserved == "cuda":
            # Try another GPU if available
            for idx in range(torch.cuda.device_count()):
                if f"cuda:{idx}" != reserved:
                    return torch.device(f"cuda:{idx}")
            return torch.device("cpu")
    return device


def get_device_for_model(model_name: str, *, log_device: bool = False) -> torch.device:
    pref_map = {
        "panecho": settings.PANECHO_DEVICE,
        "echoprime": settings.ECHO_PRIME_DEVICE,
        "echonet": settings.ECHONET_DEVICE,
        "measurements": settings.MEASUREMENTS_DEVICE,
    }
    pref = pref_map.get(model_name, "auto")
    device = _device_from_pref(pref)
    device = _avoid_reserved(device)
    if log_device:
        logger.info("Model '%s' using device '%s'", model_name, device)
    return device
