import os
from typing import Any, Dict, List, Optional

import pydicom


ULTRASOUND_REGIONS_TAG = (0x0018, 0x6011)
REGION_SPATIAL_FORMAT_SUBTAG = (0x0018, 0x6012)
REGION_DATA_TYPE_SUBTAG = (0x0018, 0x6014)
REGION_X0_SUBTAG = (0x0018, 0x6018)
REGION_Y0_SUBTAG = (0x0018, 0x601A)
REGION_X1_SUBTAG = (0x0018, 0x601C)
REGION_Y1_SUBTAG = (0x0018, 0x601E)
REGION_PHYSICAL_DELTA_X_SUBTAG = (0x0018, 0x602C)
REGION_PHYSICAL_DELTA_Y_SUBTAG = (0x0018, 0x602E)
REFERENCE_LINE_TAG = (0x0018, 0x6022)

SPECTRAL_SPATIAL_FORMAT = 3
PW_DATA_TYPE = 3
CW_DATA_TYPE = 4


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def _safe_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except Exception:
        return None


def _safe_str(value: Any) -> Optional[str]:
    if value is None:
        return None
    out = str(value).strip()
    return out if out else None


def _normalize_enum_value(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)

    raw = str(value).strip().lower()
    if not raw:
        return None

    if raw.endswith("h"):
        raw = raw[:-1]
    if raw.startswith("0x"):
        raw = raw[2:]

    try:
        if any(ch in "abcdef" for ch in raw):
            return int(raw, 16)
        return int(raw, 10)
    except Exception:
        try:
            return int(raw, 16)
        except Exception:
            return None


def _spectral_subtype(region_data_type: Optional[int]) -> Optional[str]:
    if region_data_type == PW_DATA_TYPE:
        return "pw"
    if region_data_type == CW_DATA_TYPE:
        return "cw"
    return None


def _parse_region(region: pydicom.Dataset) -> Optional[Dict[str, Any]]:
    x0 = _safe_int(region[REGION_X0_SUBTAG].value) if REGION_X0_SUBTAG in region else None
    y0 = _safe_int(region[REGION_Y0_SUBTAG].value) if REGION_Y0_SUBTAG in region else None
    x1 = _safe_int(region[REGION_X1_SUBTAG].value) if REGION_X1_SUBTAG in region else None
    y1 = _safe_int(region[REGION_Y1_SUBTAG].value) if REGION_Y1_SUBTAG in region else None
    if None in (x0, y0, x1, y1):
        return None

    spatial_format = _normalize_enum_value(
        region[REGION_SPATIAL_FORMAT_SUBTAG].value
    ) if REGION_SPATIAL_FORMAT_SUBTAG in region else None
    data_type = _normalize_enum_value(
        region[REGION_DATA_TYPE_SUBTAG].value
    ) if REGION_DATA_TYPE_SUBTAG in region else None
    is_spectral = spatial_format == SPECTRAL_SPATIAL_FORMAT and data_type in {PW_DATA_TYPE, CW_DATA_TYPE}

    reference_line = _safe_int(region[REFERENCE_LINE_TAG].value) if REFERENCE_LINE_TAG in region else None
    physical_delta_x = _safe_float(
        region[REGION_PHYSICAL_DELTA_X_SUBTAG].value
    ) if REGION_PHYSICAL_DELTA_X_SUBTAG in region else None
    physical_delta_y = _safe_float(
        region[REGION_PHYSICAL_DELTA_Y_SUBTAG].value
    ) if REGION_PHYSICAL_DELTA_Y_SUBTAG in region else None

    return {
        "x0": x0,
        "y0": y0,
        "x1": x1,
        "y1": y1,
        "reference_line": reference_line,
        "physical_delta_x": abs(physical_delta_x) if physical_delta_x is not None else None,
        "physical_delta_y": abs(physical_delta_y) if physical_delta_y is not None else None,
        "region_spatial_format": spatial_format,
        "region_data_type": data_type,
        "is_spectral": is_spectral,
        "spectral_subtype": _spectral_subtype(data_type) if is_spectral else None,
    }


def extract_doppler_regions(ds: pydicom.Dataset) -> List[Dict[str, Any]]:
    if ULTRASOUND_REGIONS_TAG not in ds:
        return []

    parsed_regions: List[Dict[str, Any]] = []
    for region in ds[ULTRASOUND_REGIONS_TAG].value:
        parsed = _parse_region(region)
        if parsed:
            parsed_regions.append(parsed)
    return parsed_regions


def extract_doppler_region(ds: pydicom.Dataset) -> Optional[Dict[str, Any]]:
    """
    Return the primary spectral Doppler region selected as the lowest spectral region.
    """
    spectral_regions = [r for r in extract_doppler_regions(ds) if r.get("is_spectral")]
    if not spectral_regions:
        return None
    return sorted(spectral_regions, key=lambda item: item["y0"], reverse=True)[0]


def inspect_doppler_tags(file_path: str) -> Dict[str, Any]:
    """
    Inspect DICOM tags and return a spectral Doppler candidate decision payload.
    """
    if not file_path or not os.path.exists(file_path):
        return {
            "ok": False,
            "is_doppler_candidate": False,
            "reason_code": "FILE_NOT_FOUND",
            "details": {"file_path": file_path},
        }

    try:
        ds = pydicom.dcmread(file_path, stop_before_pixels=True, force=True)
    except Exception as err:
        return {
            "ok": False,
            "is_doppler_candidate": False,
            "reason_code": "DICOM_READ_FAILED",
            "details": {"file_path": file_path, "error": str(err)},
        }

    modality = _safe_str(getattr(ds, "Modality", None))
    sop_class_uid = _safe_str(getattr(ds, "SOPClassUID", None))
    photometric = _safe_str(getattr(ds, "PhotometricInterpretation", None))
    series_description = _safe_str(getattr(ds, "SeriesDescription", None))
    protocol_name = _safe_str(getattr(ds, "ProtocolName", None))

    regions = extract_doppler_regions(ds)
    spectral_regions = [r for r in regions if r.get("is_spectral")]
    region = extract_doppler_region(ds)

    if ULTRASOUND_REGIONS_TAG not in ds or not regions:
        reason_code = "MISSING_ULTRASOUND_REGION"
        is_candidate = False
    elif not region:
        reason_code = "NO_SPECTRAL_REGION"
        is_candidate = False
    else:
        reason_code = "TAGS_PRESENT"
        is_candidate = True

    warnings: List[str] = []
    if region and region.get("reference_line") is None:
        warnings.append("MISSING_REFERENCE_LINE")
    if region and region.get("physical_delta_y") is None:
        warnings.append("MISSING_PHYSICAL_DELTA_Y")
    if region and region.get("physical_delta_x") is None:
        warnings.append("MISSING_PHYSICAL_DELTA_X")

    return {
        "ok": True,
        "is_doppler_candidate": is_candidate,
        "reason_code": reason_code,
        "details": {
            "file_path": file_path,
            "modality": modality,
            "sop_class_uid": sop_class_uid,
            "photometric_interpretation": photometric,
            "series_description": series_description,
            "protocol_name": protocol_name,
            "regions_total": len(regions),
            "spectral_regions_total": len(spectral_regions),
            "doppler_region": region,
            "is_explicit_spectral": bool(region),
            "spectral_subtype": region.get("spectral_subtype") if region else None,
            "warnings": warnings,
        },
    }
