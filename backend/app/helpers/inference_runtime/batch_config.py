from typing import Dict

from app.core.config import settings

_DEFAULTS: Dict[str, int] = {
    "panecho": settings.PANECHO_BATCH,
    "echonet": settings.ECHONET_BATCH,
    "measurements": settings.MEASUREMENTS_BATCH,
}


def get_batch_size(model_name: str) -> int:
    """
    Return configured batch size for a model, clamped to at least 1.
    """
    size = _DEFAULTS.get(model_name, 1)
    try:
        size_int = int(size)
    except Exception:
        return 1
    return max(1, size_int)
