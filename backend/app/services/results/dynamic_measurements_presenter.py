from __future__ import annotations

from typing import Any, Dict, List, Optional


_TASK_LABEL_FALLBACKS = {
    "echonet_dynamic_lv_segmentation": "Left Ventricle (LV) segmentation",
    "measurements_2d": "2D Measurements",
    "measurements_doppler": "Doppler Measurements",
}

_VIDEO_SUFFIXES = (".mp4", ".webm", ".mov", ".avi")
_IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png", ".gif", ".bmp")


def _safe_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _safe_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _to_optional_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _to_optional_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return float(str(value))
    except Exception:
        return None


def _infer_output_kind(output_path: Optional[str]) -> Optional[str]:
    if not output_path:
        return None
    lowered = output_path.lower()
    if lowered.endswith(_VIDEO_SUFFIXES):
        return "video"
    if lowered.endswith(_IMAGE_SUFFIXES):
        return "image"
    return None


def _normalize_result_label(result: Dict[str, Any]) -> Optional[str]:
    ui_label = _to_optional_str(result.get("ui_label"))
    if ui_label:
        return ui_label

    weight_name = _to_optional_str(result.get("weights"))
    if weight_name:
        return weight_name

    task = _to_optional_str(result.get("task"))
    return _TASK_LABEL_FALLBACKS.get(task) if task else None


def _normalize_derived_dicom(value: Any) -> Optional[Dict[str, Any]]:
    payload = _safe_dict(value)
    if not payload:
        return None

    normalized = {
        "relative_dicom_path": _to_optional_str(payload.get("relative_dicom_path")),
        "sop_instance_uid": _to_optional_str(payload.get("sop_instance_uid")),
        "series_instance_uid": _to_optional_str(payload.get("series_instance_uid")),
        "series_description": _to_optional_str(payload.get("series_description")),
        "orthanc_instance_id": _to_optional_str(payload.get("orthanc_instance_id")),
        "orthanc_series_id": _to_optional_str(payload.get("orthanc_series_id")),
        "orthanc_study_id": _to_optional_str(payload.get("orthanc_study_id")),
        "orthanc_status": _to_optional_str(payload.get("orthanc_status")),
    }

    if not any(normalized.values()):
        return None
    return normalized


def _normalize_result_item(result: Any) -> Optional[Dict[str, Any]]:
    payload = _safe_dict(result)
    if not payload:
        return None

    task = _to_optional_str(payload.get("task"))
    status = _to_optional_str(payload.get("status"))
    output_path = _to_optional_str(payload.get("output_path"))
    output_kind = _to_optional_str(payload.get("output_kind")) or _infer_output_kind(output_path)
    message = _to_optional_str(payload.get("message"))
    ui_label = _normalize_result_label(payload)
    derived_dicom = _normalize_derived_dicom(payload.get("derived_dicom"))

    normalized_result = {
        "task": task,
        "ui_label": ui_label,
        "status": status,
        "output_path": output_path,
        "output_kind": output_kind,
        "message": message,
    }
    if derived_dicom is not None:
        normalized_result["derived_dicom"] = derived_dicom

    return normalized_result


def _normalize_instance(instance: Any) -> Optional[Dict[str, Any]]:
    payload = _safe_dict(instance)
    if not payload:
        return None

    results = [
        normalized
        for normalized in (_normalize_result_item(item) for item in _safe_list(payload.get("results")))
        if normalized is not None
    ]

    return {
        "sop_instance_uid": _to_optional_str(payload.get("sop_instance_uid")),
        "instance_number": _to_optional_str(payload.get("instance_number")),
        "predicted_view": _to_optional_str(payload.get("predicted_view")),
        "predicted_view_confidence": _to_optional_float(payload.get("predicted_view_confidence")),
        "results": results,
    }


def _normalize_meta(meta: Any) -> Optional[Dict[str, int]]:
    payload = _safe_dict(meta)
    if not payload:
        return None

    normalized: Dict[str, int] = {}
    for key in (
        "dynamic_runs",
        "measurements_2d_runs",
        "measurements_doppler_runs",
        "skipped_instances",
        "error_count",
    ):
        value = payload.get(key)
        if isinstance(value, int):
            normalized[key] = value
    return normalized or None


def build_dynamic_measurements_payload(value_json: Any) -> Dict[str, Any]:
    payload = _safe_dict(value_json)

    instances = [
        normalized
        for normalized in (_normalize_instance(item) for item in _safe_list(payload.get("instances")))
        if normalized is not None
    ]

    normalized_payload: Dict[str, Any] = {"instances": instances}
    meta = _normalize_meta(payload.get("meta"))
    if meta is not None:
        normalized_payload["meta"] = meta
    return normalized_payload


__all__ = ["build_dynamic_measurements_payload"]
