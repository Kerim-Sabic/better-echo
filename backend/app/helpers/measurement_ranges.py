from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_RANGES_PATH = Path(__file__).resolve().parents[3] / "frontend" / "src" / "features" / "StudyResults" / "helpers" / "measurementRanges.json"


def _load_ranges() -> Dict[str, Any]:
    try:
        with _RANGES_PATH.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, dict) else {}
    except Exception as exc:
        logger.warning(f"[measurement_ranges] Failed to load ranges: {exc}")
        return {}


_MEASUREMENT_RANGES = _load_ranges()


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
    task_def = _MEASUREMENT_RANGES.get(task_key)
    if not isinstance(task_def, dict):
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
        else:
            if value < min_val:
                return False
    if max_val is not None:
        if band.get("exclusiveMax"):
            if value >= max_val:
                return False
        else:
            if value > max_val:
                return False
    return True


def _matches_any(value: float, ranges: Any) -> bool:
    for band in _normalize_ranges(ranges):
        if _matches_range(value, band):
            return True
    return False


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
