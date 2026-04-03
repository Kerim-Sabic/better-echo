from __future__ import annotations

from typing import Any, Optional

from app.helpers.clinical.measurement_display import get_range_status as _get_range_status


def get_range_status(task_key: str, value: Optional[float], patient_sex: Any) -> Optional[str]:
    return _get_range_status(task_key, value, patient_sex)
