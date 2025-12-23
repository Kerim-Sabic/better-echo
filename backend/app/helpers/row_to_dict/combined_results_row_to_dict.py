from typing import Any, Dict, Optional, Tuple
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_CONFIG_FILE = Path(__file__).resolve().parents[2] / "configs" / "thresholds.config.json"
try:
    with _CONFIG_FILE.open(encoding="utf-8") as f:
        TASK_CONFIG = json.load(f)
except Exception as exc:
    TASK_CONFIG = {}
    logger.warning(f"[combined_results_row_to_dict] Failed to load thresholds config: {exc}")

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
    cfg = TASK_CONFIG.get(task_key) if isinstance(TASK_CONFIG, dict) else None
    candidate = None
    if isinstance(cfg, dict):
        candidate = cfg.get("panecho_name") or cfg.get("echoprime_name")
    if isinstance(candidate, str) and candidate.strip():
        return candidate.strip().replace("_", " ").replace("-", " ")
    return task_key.replace("_", " ").replace("-", " ").strip()

def _to_float_or_none(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return float(str(value))
    except Exception:
        return None

def build_combined_sections_payload(value_json: Optional[Any]) -> Dict[str, Any]:
    integrated_tasks, overrides, overrides_updated_at = _extract_payload(value_json)
    return {
        "integrated_tasks": integrated_tasks,
        "overrides": overrides,
        "overrides_updated_at": overrides_updated_at,
    }

def build_combined_sections_from_row(derived_results) -> Dict[str, Any]:
    if derived_results is None:
        return {
            "integrated_tasks": {},
            "overrides": {},
            "overrides_updated_at": None,
        }
    return build_combined_sections_payload(getattr(derived_results, "value_json", None))

def build_combined_sections_for_llm(derived_results) -> Dict[str, Any]:
    if derived_results is None:
        return {"tasks": {}}

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

        tasks_payload[task_key] = {
            "name": _task_display_name(task_key),
            "type": "measurement" if is_measurement else "classification",
            "value": _to_float_or_none(value) if is_measurement else None,
            "units": units if is_measurement else None,
            "label": label if not is_measurement else None,
            "confidence": confidence if not is_measurement else None,
            "discrepancy": False if has_override else bool(task.get("discrepancy")),
            "overridden": has_override,
        }

    return {"tasks": tasks_payload}
