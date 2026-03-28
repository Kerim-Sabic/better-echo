from typing import Dict

from app.core.config import settings

_DEFAULTS: Dict[str, int] = {
    "primary_analysis": settings.PRIMARY_ANALYSIS_BATCH,
    "motion_segmentation": settings.MOTION_SEGMENTATION_BATCH,
    "study_measurements": settings.STUDY_MEASUREMENTS_BATCH,
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
