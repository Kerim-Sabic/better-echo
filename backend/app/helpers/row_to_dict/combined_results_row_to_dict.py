from typing import Any, Dict, Optional, Tuple

def _safe_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}

def _extract_payload(value_json: Any) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    payload = _safe_dict(value_json)
    if "integrated_tasks" in payload:
        integrated = _safe_dict(payload.get("integrated_tasks"))
        overrides = _safe_dict(payload.get("overrides"))
        return integrated, overrides
    return payload, {}

def _apply_overrides(integrated_tasks: Dict[str, Any], overrides: Dict[str, Any]) -> Dict[str, Any]:
    if not integrated_tasks or not overrides:
        return integrated_tasks
    merged: Dict[str, Any] = {}
    for key, task in integrated_tasks.items():
        if not isinstance(task, dict):
            merged[key] = task
            continue
        override = overrides.get(key)
        if not isinstance(override, dict):
            merged[key] = task
            continue
        updated = dict(task)
        if override.get("label") is not None:
            updated["integrated_label"] = override["label"]
        if override.get("value") is not None:
            updated["integrated_value"] = override["value"]
        merged[key] = updated
    return merged

def build_combined_sections_payload(value_json: Optional[Any]) -> Dict[str, Any]:
    integrated_tasks, overrides = _extract_payload(value_json)
    return {
        "integrated_tasks": integrated_tasks,
        "overrides": overrides,
    }

def build_combined_sections_from_row(derived_results) -> Dict[str, Any]:
    if derived_results is None:
        return {
            "integrated_tasks": {},
            "overrides": {},
        }
    return build_combined_sections_payload(getattr(derived_results, "value_json", None))

def build_combined_sections_for_llm(derived_results) -> Dict[str, Any]:
    if derived_results is None:
        return {
            "integrated_tasks": {},
        }
    integrated_tasks, overrides = _extract_payload(getattr(derived_results, "value_json", None))
    return {
        "integrated_tasks": _apply_overrides(integrated_tasks, overrides),
    }
