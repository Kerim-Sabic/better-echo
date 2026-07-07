"""
GLS bullseye document builder (ASE/EACVI 17-segment model).

This module assembles a *provenance-truthful* bullseye document from data the
system actually measures:

- Global longitudinal strain (GLS): PanEcho produces one global scalar. It is
  the real, measured value shown with the bullseye and ASE normative banding.
- Per-segment strain: PanEcho does NOT produce per-segment strain. This builder
  therefore never fabricates 17 values from the single global number. Segments
  are marked ``measured=False`` until a real segmental-strain source
  (``SEGMENTAL_STRAIN_TYPE``, see contract below) is available, at which point
  they light up with zero rendering changes.

Contract for future segmental data (``SEGMENTAL_STRAIN_TYPE`` derived result):
    value_json = {"segments": {"1": -20.4, "2": -18.1, ... "17": -22.0}}
    (peak systolic longitudinal strain per ASE segment id, negative %).

The 17-segment geometry, coronary-territory mapping, ring layout, and normative
bands here follow the ASE/EACVI standard (Lang et al., 2015; Voigt et al.,
2015) so the plot is report-grade.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.helpers.clinical.measurement_display import (
    _resolve_bands,
    get_range_status,
)

SCHEMA_VERSION = 1
PRESENTATION = "ASE/EACVI 17-segment"
GLS_TASK_KEY = "gls"


# Part 1. Canonical ASE/EACVI 17-segment model.
# Rings: 0=basal (6), 1=mid (6), 2=apical (4), 3=apex (1). wedge_index is the
# clockwise position within the ring starting at anterior (top of the bullseye).
# Coronary territories use the standard ASE assignment; the apex is attributed
# to the LAD by convention.
def _segment(
    seg_id: int,
    code: str,
    name: str,
    ring: int,
    ring_name: str,
    wedge_index: int,
    wedge_count: int,
    territory: str,
) -> Dict[str, Any]:
    return {
        "id": seg_id,
        "code": code,
        "name": name,
        "ring": ring,
        "ring_name": ring_name,
        "wedge_index": wedge_index,
        "wedge_count": wedge_count,
        "territory": territory,
    }


ASE_17_SEGMENTS: List[Dict[str, Any]] = [
    # Basal ring (segments 1-6)
    _segment(1, "basal_anterior", "Basal Anterior", 0, "basal", 0, 6, "LAD"),
    _segment(2, "basal_anteroseptal", "Basal Anteroseptal", 0, "basal", 1, 6, "LAD"),
    _segment(3, "basal_inferoseptal", "Basal Inferoseptal", 0, "basal", 2, 6, "RCA"),
    _segment(4, "basal_inferior", "Basal Inferior", 0, "basal", 3, 6, "RCA"),
    _segment(5, "basal_inferolateral", "Basal Inferolateral", 0, "basal", 4, 6, "LCX"),
    _segment(6, "basal_anterolateral", "Basal Anterolateral", 0, "basal", 5, 6, "LCX"),
    # Mid ring (segments 7-12)
    _segment(7, "mid_anterior", "Mid Anterior", 1, "mid", 0, 6, "LAD"),
    _segment(8, "mid_anteroseptal", "Mid Anteroseptal", 1, "mid", 1, 6, "LAD"),
    _segment(9, "mid_inferoseptal", "Mid Inferoseptal", 1, "mid", 2, 6, "RCA"),
    _segment(10, "mid_inferior", "Mid Inferior", 1, "mid", 3, 6, "RCA"),
    _segment(11, "mid_inferolateral", "Mid Inferolateral", 1, "mid", 4, 6, "LCX"),
    _segment(12, "mid_anterolateral", "Mid Anterolateral", 1, "mid", 5, 6, "LCX"),
    # Apical ring (segments 13-16)
    _segment(13, "apical_anterior", "Apical Anterior", 2, "apical", 0, 4, "LAD"),
    _segment(14, "apical_septal", "Apical Septal", 2, "apical", 1, 4, "LAD"),
    _segment(15, "apical_inferior", "Apical Inferior", 2, "apical", 2, 4, "RCA"),
    _segment(16, "apical_lateral", "Apical Lateral", 2, "apical", 3, 4, "LCX"),
    # Apical cap (segment 17)
    _segment(17, "apex", "Apex", 3, "apex", 0, 1, "LAD"),
]

VALID_SEGMENT_IDS = frozenset(segment["id"] for segment in ASE_17_SEGMENTS)


def build_segment_model() -> List[Dict[str, Any]]:
    """Return a deep-ish copy of the canonical ASE 17-segment definition."""
    return [dict(segment) for segment in ASE_17_SEGMENTS]


# Part 2. Value helpers.
def _to_float_or_none(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        if isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return float(str(value))
    except Exception:
        return None


def _effective_global_gls(
    integrated_tasks: Dict[str, Any],
    overrides: Optional[Dict[str, Any]],
) -> Optional[float]:
    """Doctor override takes precedence over the integrated GLS value."""
    overrides = overrides if isinstance(overrides, dict) else {}
    override = overrides.get(GLS_TASK_KEY)
    if isinstance(override, dict) and override.get("value") is not None:
        value = _to_float_or_none(override.get("value"))
        if value is not None:
            return value

    task = integrated_tasks.get(GLS_TASK_KEY) if isinstance(integrated_tasks, dict) else None
    if isinstance(task, dict):
        return _to_float_or_none(task.get("integrated_value"))
    return None


def _reference_bands(patient_sex: Any) -> Optional[Dict[str, Any]]:
    bands, _prefer_normal = _resolve_bands(GLS_TASK_KEY, patient_sex)
    if not bands:
        return None
    return {
        "normal": bands.get("normal") or [],
        "borderline": bands.get("borderline") or [],
        "abnormal": bands.get("abnormal") or [],
    }


def _status_color(status: Optional[str]) -> Optional[str]:
    return {
        "normal": "green",
        "borderline": "yellow",
        "abnormal": "red",
    }.get(status or "")


def _normalize_segmental_source(segmental: Any) -> Dict[int, float]:
    """
    Accept either {"segments": {id: value}} or a bare {id: value} mapping and
    return {int id -> float value} restricted to valid ASE segment ids.
    """
    if isinstance(segmental, dict) and isinstance(segmental.get("segments"), dict):
        raw = segmental["segments"]
    elif isinstance(segmental, dict):
        raw = segmental
    else:
        return {}

    result: Dict[int, float] = {}
    for key, value in raw.items():
        seg_id = _to_float_or_none(key)
        numeric = _to_float_or_none(value)
        if seg_id is None or numeric is None:
            continue
        if not seg_id.is_integer():
            continue
        seg_id_int = int(seg_id)
        if seg_id_int in VALID_SEGMENT_IDS:
            result[seg_id_int] = numeric
    return result


# Part 3. Bullseye document builder.
def build_gls_bullseye_document(
    *,
    integrated_tasks: Dict[str, Any],
    overrides: Optional[Dict[str, Any]] = None,
    patient_sex: Any = None,
    segmental_source: Any = None,
    trend: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Build the ASE/EACVI 17-segment GLS bullseye document.

    - ``integrated_tasks`` / ``overrides``: the combined-analysis payload parts;
      the effective global GLS is read from here (real measured value).
    - ``segmental_source``: optional per-segment strain map (see module contract).
      Absent by default; segments are then marked not-measured (never fabricated).
    - ``patient_sex``: selects the sex-specific ASE normative band.
    - ``trend``: optional longitudinal series to embed (see build_gls_trend_points).
    """
    global_value = _effective_global_gls(integrated_tasks, overrides)
    global_status = get_range_status(GLS_TASK_KEY, global_value, patient_sex)

    segment_values = _normalize_segmental_source(segmental_source)

    segments: List[Dict[str, Any]] = []
    measured_count = 0
    for definition in ASE_17_SEGMENTS:
        seg_id = definition["id"]
        value = segment_values.get(seg_id)
        measured = value is not None
        if measured:
            measured_count += 1
            status = get_range_status(GLS_TASK_KEY, value, patient_sex)
        else:
            status = None
        segments.append(
            {
                **definition,
                "measured": measured,
                "value": value,
                "status": status,
                "color": _status_color(status),
            }
        )

    if measured_count > 0:
        data_completeness = "segmental"
    elif global_value is not None:
        data_completeness = "global_only"
    else:
        data_completeness = "unavailable"

    return {
        "schema_version": SCHEMA_VERSION,
        "presentation": PRESENTATION,
        "data_completeness": data_completeness,
        "global": {
            "task_key": GLS_TASK_KEY,
            "label": "Global Longitudinal Strain (GLS)",
            "value": global_value,
            "units": "%",
            "status": global_status,
            "color": _status_color(global_status),
            "measured": global_value is not None,
        },
        "reference_bands": _reference_bands(patient_sex),
        "segment_model": {
            "standard": PRESENTATION,
            "segment_count": len(ASE_17_SEGMENTS),
            "rings": [
                {"ring": 0, "name": "basal", "wedge_count": 6},
                {"ring": 1, "name": "mid", "wedge_count": 6},
                {"ring": 2, "name": "apical", "wedge_count": 4},
                {"ring": 3, "name": "apex", "wedge_count": 1},
            ],
        },
        "segments": segments,
        "measured_segment_count": measured_count,
        "trend": trend or [],
        # Explicit provenance so the UI and reports never imply measured
        # regional strain that does not exist.
        "notes": _completeness_note(data_completeness),
    }


def _completeness_note(data_completeness: str) -> str:
    if data_completeness == "segmental":
        return "Per-segment peak systolic longitudinal strain measured."
    if data_completeness == "global_only":
        return (
            "Global longitudinal strain measured. Per-segment strain is not "
            "individually measured by the current model and is not shown as "
            "regional values."
        )
    return "Global longitudinal strain unavailable for this study."


# Part 4. Longitudinal trend across studies.
def build_gls_trend_points(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build an ordered longitudinal GLS trend from per-study entries.

    Each entry: {study_uid, study_date (DICOM YYYYMMDD or None), uploaded_at
    (datetime/str/None), integrated_tasks, overrides, patient_sex}.

    Points are ordered by study_date then uploaded_at, and only include studies
    with a real measured global GLS. Returns [{study_uid, study_date, label,
    value, status}].
    """
    prepared: List[Dict[str, Any]] = []
    for entry in entries:
        value = _effective_global_gls(
            entry.get("integrated_tasks") or {},
            entry.get("overrides") or {},
        )
        if value is None:
            continue
        study_date = entry.get("study_date")
        study_date = study_date if isinstance(study_date, str) and study_date.strip() else None
        prepared.append(
            {
                "study_uid": entry.get("study_uid"),
                "study_date": study_date,
                "label": _format_study_date_label(study_date),
                "value": value,
                "status": get_range_status(GLS_TASK_KEY, value, entry.get("patient_sex")),
                "_sort_date": study_date or "",
                "_sort_uploaded": _uploaded_sort_key(entry.get("uploaded_at")),
            }
        )

    prepared.sort(key=lambda point: (point["_sort_date"], point["_sort_uploaded"]))
    for point in prepared:
        point.pop("_sort_date", None)
        point.pop("_sort_uploaded", None)
    return prepared


def _format_study_date_label(study_date: Optional[str]) -> Optional[str]:
    if not study_date:
        return None
    digits = study_date.strip()
    if len(digits) == 8 and digits.isdigit():
        return f"{digits[0:4]}-{digits[4:6]}-{digits[6:8]}"
    return digits


def _uploaded_sort_key(uploaded_at: Any) -> str:
    if uploaded_at is None:
        return ""
    isoformat = getattr(uploaded_at, "isoformat", None)
    if callable(isoformat):
        try:
            return isoformat()
        except Exception:
            return ""
    return str(uploaded_at)


__all__ = [
    "SCHEMA_VERSION",
    "PRESENTATION",
    "GLS_TASK_KEY",
    "ASE_17_SEGMENTS",
    "VALID_SEGMENT_IDS",
    "build_segment_model",
    "build_gls_bullseye_document",
    "build_gls_trend_points",
]
