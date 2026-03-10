from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_CATALOG_PATH = Path(__file__).resolve().parents[2] / "configs" / "measurement_display_catalog.json"


def _load_catalog() -> Dict[str, Dict[str, Any]]:
    try:
        with _CATALOG_PATH.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, dict) else {}
    except Exception as exc:
        logger.warning("[measurement_display] Failed to load display catalog: %s", exc)
        return {}


_DISPLAY_CATALOG = _load_catalog()


def _normalize_task_def(task_def: Any) -> Optional[Dict[str, Any]]:
    return task_def if isinstance(task_def, dict) else None


def _normalize_sex(raw_sex: Any) -> Optional[str]:
    if raw_sex is None:
        return None
    cleaned = str(raw_sex).strip().lower()
    if cleaned in {"m", "male"}:
        return "male"
    if cleaned in {"f", "female"}:
        return "female"
    return None


def _normalize_ranges(ranges: Any) -> List[Dict[str, Any]]:
    if not ranges:
        return []
    if isinstance(ranges, list):
        return [r for r in ranges if isinstance(r, dict)]
    if isinstance(ranges, dict):
        return [ranges]
    return []


def _merge_band_ranges(
    ranges: List[Dict[str, Any]],
    *,
    min_strategy: str,
    max_strategy: str,
) -> List[Dict[str, Any]]:
    normalized = [r for r in ranges if isinstance(r, dict) and ("min" in r or "max" in r)]
    if not normalized:
        return []

    mins = [r["min"] for r in normalized if "min" in r]
    maxes = [r["max"] for r in normalized if "max" in r]

    min_val = max(mins) if mins and min_strategy == "max" else (min(mins) if mins else None)
    max_val = min(maxes) if maxes and max_strategy == "min" else (max(maxes) if maxes else None)

    exclusive_min = False
    if min_val is not None:
        exclusive_min = all(r.get("exclusiveMin") for r in normalized if r.get("min") == min_val)

    exclusive_max = False
    if max_val is not None:
        exclusive_max = all(r.get("exclusiveMax") for r in normalized if r.get("max") == max_val)

    merged: Dict[str, Any] = {}
    if min_val is not None:
        merged["min"] = min_val
    if max_val is not None:
        merged["max"] = max_val
    if exclusive_min:
        merged["exclusiveMin"] = True
    if exclusive_max:
        merged["exclusiveMax"] = True

    return [merged] if merged else []


def _derive_unisex_bands(bands: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not bands.get("male") and not bands.get("female"):
        return None

    male = bands.get("male") or {}
    female = bands.get("female") or {}

    return {
        "normal": _merge_band_ranges(
            _normalize_ranges(male.get("normal")) + _normalize_ranges(female.get("normal")),
            min_strategy="min",
            max_strategy="max",
        ),
        "borderline": _merge_band_ranges(
            _normalize_ranges(male.get("borderline")) + _normalize_ranges(female.get("borderline")),
            min_strategy="max",
            max_strategy="max",
        ),
        "abnormal": _merge_band_ranges(
            _normalize_ranges(male.get("abnormal")) + _normalize_ranges(female.get("abnormal")),
            min_strategy="max",
            max_strategy="min",
        ),
    }


def _resolve_bands(task_key: str, patient_sex: Any) -> Tuple[Optional[Dict[str, Any]], bool]:
    task_def = get_task_definition(task_key)
    if not task_def:
        return None, False

    bands = task_def.get("bands")
    if not isinstance(bands, dict):
        return None, False

    sex_key = _normalize_sex(patient_sex)
    if sex_key and isinstance(bands.get(sex_key), dict):
        return bands[sex_key], False

    if isinstance(bands.get("unisex"), dict):
        return bands["unisex"], False

    return _derive_unisex_bands(bands), True


def _matches_range(value: float, band: Dict[str, Any]) -> bool:
    min_val = band.get("min")
    max_val = band.get("max")
    if min_val is not None:
        if band.get("exclusiveMin"):
            if value <= min_val:
                return False
        elif value < min_val:
            return False
    if max_val is not None:
        if band.get("exclusiveMax"):
            if value >= max_val:
                return False
        elif value > max_val:
            return False
    return True


def _matches_any(value: float, ranges: Any) -> bool:
    return any(_matches_range(value, band) for band in _normalize_ranges(ranges))


def get_task_definition(task_key: str) -> Optional[Dict[str, Any]]:
    return _normalize_task_def(_DISPLAY_CATALOG.get(task_key))


def get_display_name(task_key: str) -> str:
    task_def = get_task_definition(task_key)
    if task_def and isinstance(task_def.get("display_name"), str) and task_def["display_name"].strip():
        return task_def["display_name"].strip()
    return task_key.replace("_", " ").replace("-", " ").strip()


def get_section_name(task_key: str) -> Optional[str]:
    task_def = get_task_definition(task_key)
    section = task_def.get("section") if task_def else None
    return section if isinstance(section, str) and section else None


def get_section_order(task_key: str) -> Optional[int]:
    task_def = get_task_definition(task_key)
    section_order = task_def.get("section_order") if task_def else None
    return section_order if isinstance(section_order, int) else None


def get_item_order(task_key: str) -> Optional[int]:
    task_def = get_task_definition(task_key)
    item_order = task_def.get("item_order") if task_def else None
    return item_order if isinstance(item_order, int) else None


def is_main_measurement(task_key: str) -> bool:
    task_def = get_task_definition(task_key)
    return bool(task_def and task_def.get("main"))


def get_main_measurement_order(task_key: str) -> Optional[int]:
    task_def = get_task_definition(task_key)
    main_order = task_def.get("main_order") if task_def else None
    return main_order if isinstance(main_order, int) else None


def is_range_display_task(task_key: str) -> bool:
    task_def = get_task_definition(task_key)
    return bool(task_def and task_def.get("range_display"))


def is_indexable_task(task_key: str) -> bool:
    task_def = get_task_definition(task_key)
    return bool(task_def and task_def.get("indexable"))


def get_edit_type(task_key: str) -> str:
    task_def = get_task_definition(task_key)
    edit_type = task_def.get("edit_type") if task_def else None
    if edit_type in {"label", "value"}:
        return edit_type
    kind = task_def.get("kind") if task_def else None
    return "label" if kind == "categorical" else "value"


def is_editable_task(task_key: str) -> bool:
    task_def = get_task_definition(task_key)
    return bool(task_def and task_def.get("editable", True))


def get_edit_options(task_key: str, current_label: Optional[str] = None) -> List[str]:
    task_def = get_task_definition(task_key)
    categories = task_def.get("categories") if task_def else None
    values: List[str] = []
    if isinstance(categories, dict):
        for bucket in ("normal", "borderline", "abnormal"):
            bucket_values = categories.get(bucket)
            if isinstance(bucket_values, list):
                for value in bucket_values:
                    if isinstance(value, str) and value not in values:
                        values.append(value)
    if current_label and current_label not in values:
        values.append(current_label)
    return values


def get_range_status(task_key: str, value: Optional[float], patient_sex: Any) -> Optional[str]:
    if value is None:
        return None

    bands, prefer_normal = _resolve_bands(task_key, patient_sex)
    if not bands:
        return None

    normal = bands.get("normal")
    borderline = bands.get("borderline")
    abnormal = bands.get("abnormal")

    if prefer_normal:
        if _matches_any(value, normal):
            return "normal"
        if _matches_any(value, abnormal):
            return "abnormal"
        if _matches_any(value, borderline):
            return "borderline"
    else:
        if _matches_any(value, abnormal):
            return "abnormal"
        if _matches_any(value, borderline):
            return "borderline"
        if _matches_any(value, normal):
            return "normal"

    return None


def get_color_for_numeric(task_key: str, value: Optional[float], patient_sex: Any) -> Optional[str]:
    status = get_range_status(task_key, value, patient_sex)
    if status == "normal":
        return "green"
    if status == "borderline":
        return "yellow"
    if status == "abnormal":
        return "red"

    bands, _prefer_normal = _resolve_bands(task_key, patient_sex)
    if bands and _normalize_ranges(bands.get("normal")):
        return "yellow"
    return None


def get_color_for_label(task_key: str, label: Optional[str]) -> Optional[str]:
    if not label:
        return None

    task_def = get_task_definition(task_key)
    categories = task_def.get("categories") if task_def else None
    if not isinstance(categories, dict):
        return None

    cleaned = label.strip()
    if cleaned in categories.get("normal", []):
        return "green"
    if cleaned in categories.get("borderline", []):
        return "yellow"
    if cleaned in categories.get("abnormal", []):
        return "red"
    return None
