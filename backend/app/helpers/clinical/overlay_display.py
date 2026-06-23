from __future__ import annotations

from typing import Any, Dict, Optional

from app.AI_models.measurements.constants import VALID_2D_WEIGHTS, VALID_DOPPLER_WEIGHTS
from app.core.artifacts import (
    DOPPLER_MEASUREMENT_OVERLAY_KIND,
    DOPPLER_MEASUREMENT_OVERLAY_TYPE,
    LINEAR_MEASUREMENT_OVERLAY_KIND,
    LINEAR_MEASUREMENT_OVERLAY_TYPE,
    LV_SEGMENTATION_OVERLAY_KIND,
    LV_SEGMENTATION_OVERLAY_TYPE,
)
from app.helpers.clinical.measurement_display import get_display_name, get_task_definition

FAMILY_LABEL_BY_KIND = {
    LV_SEGMENTATION_OVERLAY_KIND: "LV Segmentation",
    LINEAR_MEASUREMENT_OVERLAY_KIND: "2D Linear",
    DOPPLER_MEASUREMENT_OVERLAY_KIND: "Doppler",
}
FAMILY_LABEL_BY_TYPE = {
    LV_SEGMENTATION_OVERLAY_TYPE: "LV Segmentation",
    LINEAR_MEASUREMENT_OVERLAY_TYPE: "2D Linear",
    DOPPLER_MEASUREMENT_OVERLAY_TYPE: "Doppler",
}


def _clean_key(value: Any) -> Optional[str]:
    return value if isinstance(value, str) and value.strip() else None


def _display_name_for_key(
    *, overlay_type: str, overlay_key: Optional[str]
) -> Optional[str]:
    if overlay_type == LV_SEGMENTATION_OVERLAY_TYPE:
        return get_display_name(LV_SEGMENTATION_OVERLAY_TYPE)

    if not overlay_key:
        return None

    if overlay_type in {
        LINEAR_MEASUREMENT_OVERLAY_TYPE,
        DOPPLER_MEASUREMENT_OVERLAY_TYPE,
    } and get_task_definition(overlay_key):
        return get_display_name(overlay_key)

    return None


def _format_number(value: Any) -> Optional[str]:
    if not isinstance(value, (int, float)):
        return None
    if abs(value) >= 100:
        return f"{value:.1f}"
    return f"{value:.2f}"


def _summary_value(
    *,
    doc: Dict[str, Any],
    overlay_type: str,
    measurement: Dict[str, Any],
) -> Dict[str, Optional[str]]:
    value = measurement.get("measurement_value")
    units = measurement.get("measurement_units")
    formatted = _format_number(value)

    if overlay_type == LINEAR_MEASUREMENT_OVERLAY_TYPE and formatted:
        return {
            "summary_value_label": f"Max {formatted}{f' {units}' if units else ''}",
            "summary_value_kind": "max_length_cm",
        }

    if overlay_type == DOPPLER_MEASUREMENT_OVERLAY_TYPE and formatted:
        return {
            "summary_value_label": f"{formatted}{f' {units}' if units else ''}",
            "summary_value_kind": "measurement_value",
        }

    return {"summary_value_label": None, "summary_value_kind": None}


def overlay_display_metadata(
    *,
    doc: Dict[str, Any],
    overlay_type: str,
    overlay_key: Optional[str],
    measurement: Dict[str, Any],
) -> Dict[str, Optional[str]]:
    kind = _clean_key(doc.get("kind"))
    family_label = FAMILY_LABEL_BY_KIND.get(kind) or FAMILY_LABEL_BY_TYPE.get(
        overlay_type
    )
    display_name = _display_name_for_key(
        overlay_type=overlay_type,
        overlay_key=overlay_key,
    )

    return {
        "display_name": display_name or family_label or "AI Overlay",
        "family_label": family_label,
        **_summary_value(doc=doc, overlay_type=overlay_type, measurement=measurement),
    }


def current_linear_overlay_keys() -> set[str]:
    return set(VALID_2D_WEIGHTS)


def current_doppler_overlay_keys() -> set[str]:
    return set(VALID_DOPPLER_WEIGHTS)
