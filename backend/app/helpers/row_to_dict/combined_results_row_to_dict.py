from typing import Any, Dict, Optional, Tuple

from app.helpers.clinical.measurement_display import get_display_name, get_range_status, is_editable_task

def _safe_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}

def _extract_payload(value_json: Any) -> Tuple[Dict[str, Any], Dict[str, Any], Optional[str]]:
    payload = _safe_dict(value_json)
    if "integrated_tasks" in payload:
        integrated = _safe_dict(payload.get("integrated_tasks"))
        overrides = _safe_dict(payload.get("overrides"))
        overrides_updated_at = payload.get("overrides_updated_at")
        overrides_updated_at = overrides_updated_at if isinstance(overrides_updated_at, str) else None
        return integrated, overrides, overrides_updated_at
    return payload, {}, None

def _task_display_name(task_key: str) -> str:
    return get_display_name(task_key)

def _to_float_or_none(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return float(str(value))
    except Exception:
        return None


def _public_override_item(override: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(override, dict):
        return None

    if override.get("value") is not None:
        value = _to_float_or_none(override.get("value"))
        if value is not None:
            return {"value": value}

    label = override.get("label")
    if isinstance(label, str) and label.strip():
        return {"label": label.strip()}

    return None


def _build_public_overrides_payload(overrides: Dict[str, Any]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    for task_key, override in overrides.items():
        public_item = _public_override_item(override)
        if public_item is not None:
            payload[task_key] = public_item
    return payload


def _build_edit_baselines_payload(integrated_tasks: Dict[str, Any]) -> Dict[str, Any]:
    baselines: Dict[str, Any] = {}

    for task_key, task in integrated_tasks.items():
        if not isinstance(task, dict) or not is_editable_task(task_key):
            continue

        units = task.get("units")
        if units is not None:
            value = _to_float_or_none(task.get("integrated_value"))
            if value is not None:
                baselines[task_key] = {"rawValue": value}
            continue

        label = task.get("integrated_label")
        if isinstance(label, str) and label.strip():
            baselines[task_key] = {"label": label.strip()}

    return baselines


def build_combined_sections_payload(value_json: Optional[Any]) -> Dict[str, Any]:
    integrated_tasks, overrides, overrides_updated_at = _extract_payload(value_json)
    return {
        "integrated_tasks": integrated_tasks,
        "edit_baselines": _build_edit_baselines_payload(integrated_tasks),
        "overrides": _build_public_overrides_payload(overrides),
        "overrides_updated_at": overrides_updated_at,
    }

def build_combined_sections_from_row(derived_results) -> Dict[str, Any]:
    if derived_results is None:
        return {
            "integrated_tasks": {},
            "edit_baselines": {},
            "overrides": {},
            "overrides_updated_at": None,
        }
    return build_combined_sections_payload(getattr(derived_results, "value_json", None))

def build_combined_sections_for_llm(derived_results) -> Dict[str, Any]:
    if derived_results is None:
        return {"tasks": {}}

    patient_sex = None
    try:
        patient = getattr(getattr(derived_results, "study", None), "patient", None)
        patient_sex = getattr(patient, "patient_sex", None)
    except Exception:
        patient_sex = None
    if isinstance(patient_sex, str):
        patient_sex = patient_sex.strip().lower()
        if patient_sex == "m":
            patient_sex = "male"
        elif patient_sex == "f":
            patient_sex = "female"

    integrated_tasks, overrides, _overrides_updated_at = _extract_payload(
        getattr(derived_results, "value_json", None)
    )
    tasks_payload: Dict[str, Any] = {}

    for task_key, task in integrated_tasks.items():
        if not isinstance(task, dict):
            continue

        override = overrides.get(task_key) if isinstance(overrides, dict) else None
        has_override = isinstance(override, dict) and (
            override.get("label") is not None or override.get("value") is not None
        )

        units = task.get("units")
        is_measurement = units is not None
        value = override.get("value") if has_override else None
        if value is None:
            value = task.get("integrated_value")

        label = override.get("label") if has_override else None
        if label is None:
            label = task.get("integrated_label")

        confidence = None
        if not is_measurement:
            confidence = _to_float_or_none(task.get("integrated_value"))

        range_status = None
        if is_measurement:
            range_status = get_range_status(task_key, _to_float_or_none(value), patient_sex)

        tasks_payload[task_key] = {
            "name": _task_display_name(task_key),
            "type": "measurement" if is_measurement else "classification",
            "value": _to_float_or_none(value) if is_measurement else None,
            "units": units if is_measurement else None,
            "label": label if not is_measurement else None,
            "confidence": confidence if not is_measurement else None,
            "discrepancy": False if has_override else bool(task.get("discrepancy")),
            "overridden": has_override,
            "range_status": range_status if is_measurement else None,
        }

    return {
        "patient": {"sex": patient_sex},
        "tasks": tasks_payload,
    }

