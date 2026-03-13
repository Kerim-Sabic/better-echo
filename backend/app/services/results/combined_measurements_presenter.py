from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from app.helpers.clinical.measurement_display import (
    get_color_for_label,
    get_color_for_numeric,
    get_display_name,
    get_edit_options,
    get_edit_type,
    get_item_order,
    get_main_measurement_order,
    get_section_name,
    get_section_order,
    get_task_definition,
    is_editable_task,
    is_main_measurement,
    is_range_display_task,
)
from app.helpers.row_to_dict.combined_results_row_to_dict import extract_combined_payload_parts


EF_DISCREPANCY_THRESHOLD = 8.0


def _safe_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _to_float_or_none(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return float(str(value))
    except Exception:
        return None


def _format_number(value: Optional[float]) -> Optional[str]:
    if value is None or not math.isfinite(value):
        return None
    return f"{float(value):.2f}"


def _extract_patient_sex(derived_results: Any) -> Optional[str]:
    try:
        patient = getattr(getattr(derived_results, "study", None), "patient", None)
        raw_sex = getattr(patient, "patient_sex", None)
        return raw_sex if isinstance(raw_sex, str) and raw_sex.strip() else None
    except Exception:
        return None


def _extract_heart_rate_bpm(derived_results: Any) -> Optional[float]:
    try:
        study = getattr(derived_results, "study", None)
        heart_rate_bpm = _to_float_or_none(getattr(study, "heart_rate_bpm", None))
        if heart_rate_bpm is None or not math.isfinite(heart_rate_bpm) or heart_rate_bpm <= 0:
            return None
        return heart_rate_bpm
    except Exception:
        return None


def _has_override(override: Any) -> bool:
    return isinstance(override, dict) and (
        override.get("value") is not None or override.get("label") is not None
    )


def _effective_numeric_value(
    task_key: str,
    integrated_tasks: Dict[str, Any],
    overrides: Dict[str, Any],
) -> Optional[float]:
    override = overrides.get(task_key)
    if _has_override(override) and override.get("value") is not None:
        return _to_float_or_none(override.get("value"))

    task = integrated_tasks.get(task_key)
    if not isinstance(task, dict):
        return None
    return _to_float_or_none(task.get("integrated_value"))


def _effective_label_value(
    task_key: str,
    integrated_tasks: Dict[str, Any],
    overrides: Dict[str, Any],
) -> Optional[str]:
    override = overrides.get(task_key)
    if _has_override(override) and override.get("label") is not None:
        label = override.get("label")
        return label if isinstance(label, str) and label.strip() else None

    task = integrated_tasks.get(task_key)
    if not isinstance(task, dict):
        return None
    label = task.get("integrated_label")
    return label if isinstance(label, str) and label.strip() else None


def _build_derived_context(
    integrated_tasks: Dict[str, Any],
    overrides: Dict[str, Any],
    heart_rate_bpm: Optional[float],
) -> Dict[str, Optional[float]]:
    lvedv_raw = _effective_numeric_value("lvedv", integrated_tasks, overrides)
    lvesv_raw = _effective_numeric_value("lvesv", integrated_tasks, overrides)
    lvpwd_raw = _effective_numeric_value("lvpwd", integrated_tasks, overrides)
    lvidd_raw = _effective_numeric_value("lvidd", integrated_tasks, overrides)
    avpkvel_raw = _effective_numeric_value("avpkvel", integrated_tasks, overrides)
    tvpkgrad_raw = _effective_numeric_value("tvpkgrad", integrated_tasks, overrides)

    stroke_volume = None
    if lvedv_raw is not None and lvesv_raw is not None:
        stroke_volume = lvedv_raw - lvesv_raw

    math_ef = None
    if lvedv_raw is not None and lvesv_raw is not None and lvedv_raw != 0:
        math_ef = ((lvedv_raw - lvesv_raw) / lvedv_raw) * 100.0

    return {
        "lvedv_raw": lvedv_raw,
        "lvesv_raw": lvesv_raw,
        "lvpwd_raw": lvpwd_raw,
        "lvidd_raw": lvidd_raw,
        "avpkvel_raw": avpkvel_raw,
        "tvpkgrad_raw": tvpkgrad_raw,
        "stroke_volume": stroke_volume,
        "heart_rate_bpm": heart_rate_bpm,
        "math_ef": math_ef,
        "has_volume_override": bool(
            isinstance(overrides.get("lvedv"), dict) and overrides["lvedv"].get("value") is not None
        )
        or bool(
            isinstance(overrides.get("lvesv"), dict) and overrides["lvesv"].get("value") is not None
        ),
    }


def _build_derived_tasks(context: Dict[str, Optional[float]]) -> Dict[str, Dict[str, Any]]:
    derived: Dict[str, Dict[str, Any]] = {}

    lvpwd_raw = context.get("lvpwd_raw")
    lvidd_raw = context.get("lvidd_raw")
    if lvpwd_raw is not None and lvidd_raw is not None and lvidd_raw != 0:
        derived["relative_wall_thickness"] = {
            "integrated_value": (2.0 * lvpwd_raw) / lvidd_raw,
            "integrated_label": None,
            "units": None,
            "discrepancy": False,
        }

    avpkvel_raw = context.get("avpkvel_raw")
    if avpkvel_raw is not None:
        derived["max_aortic_gradient"] = {
            "integrated_value": 4.0 * math.pow(avpkvel_raw, 2),
            "integrated_label": None,
            "units": "mmHg",
            "discrepancy": False,
        }

    stroke_volume = context.get("stroke_volume")
    heart_rate_bpm = context.get("heart_rate_bpm")
    if stroke_volume is not None and heart_rate_bpm is not None:
        derived["cardiac_output"] = {
            "integrated_value": (stroke_volume * heart_rate_bpm) / 1000.0,
            "integrated_label": None,
            "units": "L/min",
            "discrepancy": False,
        }

    tvpkgrad_raw = context.get("tvpkgrad_raw")
    if tvpkgrad_raw is not None and tvpkgrad_raw >= 0:
        derived["trv"] = {
            "integrated_value": math.sqrt(tvpkgrad_raw / 4.0),
            "integrated_label": None,
            "units": "m/s",
            "discrepancy": False,
        }

    return derived


def _build_numeric_display_value(
    *,
    task_key: str,
    task: Dict[str, Any],
    raw_value: Optional[float],
    has_override: bool,
    derived_context: Dict[str, Optional[float]],
) -> tuple[Optional[str], Optional[float]]:
    effective_value = raw_value
    use_range = is_range_display_task(task_key) and not has_override

    if (
        task_key == "ejection_fraction"
        and derived_context.get("has_volume_override")
        and effective_value is not None
    ):
        math_ef = derived_context.get("math_ef")
        if math_ef is not None and abs(math_ef - effective_value) >= EF_DISCREPANCY_THRESHOLD:
            effective_value = math_ef
            use_range = False

    if not use_range:
        return _format_number(effective_value), effective_value

    range_values = [
        _to_float_or_none(task.get("panecho_value_or_prob")),
        _to_float_or_none(task.get("echoprime_value_or_prob")),
    ]
    range_values = [value for value in range_values if value is not None]

    if len(range_values) >= 2:
        return (
            f"{_format_number(min(range_values))}-{_format_number(max(range_values))}",
            effective_value,
        )
    if len(range_values) == 1:
        return _format_number(range_values[0]), effective_value
    return _format_number(effective_value), effective_value


def _build_display_item(
    task_key: str,
    task: Dict[str, Any],
    *,
    integrated_tasks: Dict[str, Any],
    overrides: Dict[str, Any],
    patient_sex: Optional[str],
    derived_context: Dict[str, Optional[float]],
    is_derived: bool,
) -> Optional[Dict[str, Any]]:
    task_def = get_task_definition(task_key)
    if not task_def:
        return None

    override = overrides.get(task_key)
    has_override = _has_override(override) if not is_derived else False
    kind = task_def.get("kind") or "numeric"
    label = get_display_name(task_key)
    editable = is_editable_task(task_key)
    edit_type = get_edit_type(task_key)

    if kind == "categorical":
        display_value = _effective_label_value(task_key, integrated_tasks, overrides)
        probabilities = task.get("panecho_value_or_prob")
        if not isinstance(probabilities, dict):
            probabilities = None
        if display_value is None and probabilities is None:
            return None
        return {
            "key": task_key,
            "label": label,
            "kind": "categorical",
            "displayValue": display_value,
            "rawValue": None,
            "units": None,
            "probabilities": probabilities,
            "color": get_color_for_label(task_key, display_value),
            "discrepancy": False if has_override else bool(task.get("discrepancy")),
            "isOverridden": has_override,
            "editable": editable,
            "editType": edit_type,
            "editOptions": get_edit_options(task_key, display_value) if editable else None,
        }

    raw_value = (
        _to_float_or_none(task.get("integrated_value"))
        if is_derived
        else _effective_numeric_value(task_key, integrated_tasks, overrides)
    )
    display_value, effective_numeric_value = _build_numeric_display_value(
        task_key=task_key,
        task=task,
        raw_value=raw_value,
        has_override=has_override,
        derived_context=derived_context,
    )
    if display_value is None and effective_numeric_value is None:
        return None

    inherited_color_source = {
        "trv": "tvpkgrad",
        "max_aortic_gradient": "avpkvel",
    }.get(task_key)
    if inherited_color_source == "tvpkgrad":
        color = get_color_for_numeric("tvpkgrad", derived_context.get("tvpkgrad_raw"), patient_sex)
    elif inherited_color_source == "avpkvel":
        color = get_color_for_numeric("avpkvel", derived_context.get("avpkvel_raw"), patient_sex)
    else:
        color = get_color_for_numeric(task_key, effective_numeric_value, patient_sex)

    return {
        "key": task_key,
        "label": label,
        "kind": "numeric",
        "displayValue": display_value,
        "rawValue": effective_numeric_value,
        "units": task.get("units"),
        "probabilities": None,
        "color": color,
        "discrepancy": False if has_override else bool(task.get("discrepancy")),
        "isOverridden": has_override,
        "editable": editable,
        "editType": edit_type,
        "editOptions": None,
    }


def build_combined_display_payload(derived_results: Any) -> Dict[str, Any]:
    integrated_tasks, raw_overrides, _overrides_updated_at = extract_combined_payload_parts(
        getattr(derived_results, "value_json", None)
    )
    overrides = _safe_dict(raw_overrides)
    patient_sex = _extract_patient_sex(derived_results)
    heart_rate_bpm = _extract_heart_rate_bpm(derived_results)
    derived_context = _build_derived_context(integrated_tasks, overrides, heart_rate_bpm)
    derived_tasks = _build_derived_tasks(derived_context)

    display_items: Dict[str, Dict[str, Any]] = {}
    candidate_keys = set(integrated_tasks.keys()) | set(derived_tasks.keys())
    for task_key in candidate_keys:
        task = derived_tasks.get(task_key) or integrated_tasks.get(task_key)
        if not isinstance(task, dict):
            continue
        item = _build_display_item(
            task_key,
            task,
            integrated_tasks=integrated_tasks,
            overrides=overrides,
            patient_sex=patient_sex,
            derived_context=derived_context,
            is_derived=task_key in derived_tasks,
        )
        if item:
            display_items[task_key] = item

    main_measurements = sorted(
        [item for key, item in display_items.items() if is_main_measurement(key)],
        key=lambda item: (
            get_main_measurement_order(item["key"]) or 9999,
            item["label"],
        ),
    )

    section_groups: Dict[str, List[Dict[str, Any]]] = {}
    for key, item in display_items.items():
        section_name = get_section_name(key)
        if not section_name:
            continue
        section_groups.setdefault(section_name, []).append(item)

    measurements = [
        {
            "section": section_name,
            "items": sorted(
                items,
                key=lambda item: (
                    get_item_order(item["key"]) or 9999,
                    item["label"],
                ),
            ),
        }
        for section_name, items in sorted(
            section_groups.items(),
            key=lambda entry: (
                get_section_order(entry[1][0]["key"]) or 9999,
                entry[0],
            ),
        )
        if items
    ]

    total_measurements = len(main_measurements) + sum(
        len(section["items"]) for section in measurements
    )

    return {
        "mainMeasurements": main_measurements,
        "Measurements": measurements,
        "hasMainMeasurements": bool(main_measurements),
        "hasMeasurements": bool(measurements),
        "totalMeasurements": total_measurements,
    }


__all__ = ["build_combined_display_payload"]
