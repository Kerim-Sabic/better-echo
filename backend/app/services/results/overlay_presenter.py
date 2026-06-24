from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.artifacts import (
    DOPPLER_MEASUREMENT_OVERLAY_KIND,
    DOPPLER_MEASUREMENT_OVERLAY_TYPE,
    LINEAR_MEASUREMENT_OVERLAY_KIND,
    LINEAR_MEASUREMENT_OVERLAY_TYPE,
    LINEAR_MEASUREMENTS_TYPE_PREFIX,
    LV_SEGMENTATION_OVERLAY_KIND,
    LV_SEGMENTATION_OVERLAY_TYPE,
    MOTION_SEGMENTATION_TYPE,
    OVERLAYS_ROUTE_SEGMENT,
    SPECTRAL_MEASUREMENTS_TYPE_PREFIX,
    linear_measurements_result_type,
    spectral_measurements_result_type,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.instances import Instance
from app.database_models.studies import Study
from app.helpers.clinical.overlay_display import overlay_display_metadata
from app.services.pipeline.read import (
    get_active_artifact_set,
    get_latest_draft_artifact_set,
)

SUPPORTED_OVERLAY_TYPES = (
    LV_SEGMENTATION_OVERLAY_TYPE,
    LINEAR_MEASUREMENT_OVERLAY_TYPE,
    DOPPLER_MEASUREMENT_OVERLAY_TYPE,
)
_SUPPORTED_KIND_BY_TYPE = {
    LV_SEGMENTATION_OVERLAY_TYPE: LV_SEGMENTATION_OVERLAY_KIND,
    LINEAR_MEASUREMENT_OVERLAY_TYPE: LINEAR_MEASUREMENT_OVERLAY_KIND,
    DOPPLER_MEASUREMENT_OVERLAY_TYPE: DOPPLER_MEASUREMENT_OVERLAY_KIND,
}
_VIEW_LABELS_BY_PREDICTED_VIEW = {
    "PARASTERNAL_LONG": "PLAX",
    "PARASTERNAL_SHORT": "PSAX",
    "APICAL_2CHAMBER": "A2C",
    "A2C": "A2C",
    "AP2": "A2C",
    "APICAL_3CHAMBER": "A3C",
    "A3C": "A3C",
    "AP3": "A3C",
    "APICAL_4CHAMBER": "A4C",
    "A4C": "A4C",
    "AP4": "A4C",
    "APICAL_5CHAMBER": "A5C",
    "A5C": "A5C",
    "AP5": "A5C",
    "SPECTRAL_DOPPLER_PW": "PW",
    "SPECTRAL_DOPPLER_CW": "CW",
    "COLOR_DOPPLER": "Color",
}


def payload_url_for(
    *, sop_instance_uid: str, overlay_type: str, overlay_key: str | None = None
) -> str:
    if overlay_key:
        return (
            f"/api/instances/{sop_instance_uid}/{OVERLAYS_ROUTE_SEGMENT}/"
            f"{overlay_type}/{overlay_key}/payload"
        )
    return f"/api/instances/{sop_instance_uid}/{OVERLAYS_ROUTE_SEGMENT}/{overlay_type}/payload"


def _overlay_base_query(*, db: Session, study: Study, instance: Instance):
    return db.query(DerivedResult).filter(
        DerivedResult.study_id == study.id,
        DerivedResult.instance_id == instance.id,
        or_(
            DerivedResult.type == MOTION_SEGMENTATION_TYPE,
            DerivedResult.type.like(f"{LINEAR_MEASUREMENTS_TYPE_PREFIX}%"),
            DerivedResult.type.like(f"{SPECTRAL_MEASUREMENTS_TYPE_PREFIX}%"),
        ),
    )


def overlay_type_for_result_type(result_type: str | None) -> str | None:
    if result_type == MOTION_SEGMENTATION_TYPE:
        return LV_SEGMENTATION_OVERLAY_TYPE
    if isinstance(result_type, str) and result_type.startswith(LINEAR_MEASUREMENTS_TYPE_PREFIX):
        return LINEAR_MEASUREMENT_OVERLAY_TYPE
    if isinstance(result_type, str) and result_type.startswith(SPECTRAL_MEASUREMENTS_TYPE_PREFIX):
        return DOPPLER_MEASUREMENT_OVERLAY_TYPE
    return None


def overlay_key_for_result_type(result_type: str | None) -> str | None:
    if not isinstance(result_type, str):
        return None
    if result_type.startswith(LINEAR_MEASUREMENTS_TYPE_PREFIX):
        return result_type.removeprefix(LINEAR_MEASUREMENTS_TYPE_PREFIX)
    if result_type.startswith(SPECTRAL_MEASUREMENTS_TYPE_PREFIX):
        return result_type.removeprefix(SPECTRAL_MEASUREMENTS_TYPE_PREFIX)
    return None


def predicted_view_label(predicted_view: str | None) -> str | None:
    if not predicted_view:
        return None
    normalized = predicted_view.strip().upper().replace("-", "_").replace(" ", "_")
    if not normalized:
        return None
    return _VIEW_LABELS_BY_PREDICTED_VIEW.get(
        normalized,
        normalized.replace("_", " ").title(),
    )


def _result_type_for_overlay(
    *, overlay_type: str, overlay_key: str | None = None
) -> str | None:
    if overlay_type == LV_SEGMENTATION_OVERLAY_TYPE:
        return MOTION_SEGMENTATION_TYPE if overlay_key is None else None
    if overlay_type == LINEAR_MEASUREMENT_OVERLAY_TYPE and overlay_key:
        return linear_measurements_result_type(overlay_key)
    if overlay_type == DOPPLER_MEASUREMENT_OVERLAY_TYPE and overlay_key:
        return spectral_measurements_result_type(overlay_key)
    return None


def _candidate_result_types(*, db: Session, study: Study, instance: Instance) -> list[str]:
    rows = (
        _overlay_base_query(db=db, study=study, instance=instance)
        .with_entities(DerivedResult.type)
        .distinct()
        .all()
    )
    result_types = [
        row[0]
        for row in rows
        if overlay_type_for_result_type(row[0]) in SUPPORTED_OVERLAY_TYPES
    ]
    return sorted(result_types)


def _latest_rows_by_type_for_artifact_set(
    *,
    db: Session,
    study: Study,
    instance: Instance,
    result_types: list[str],
    artifact_set_id: int,
) -> dict[str, DerivedResult]:
    if not result_types:
        return {}
    rows = (
        _overlay_base_query(db=db, study=study, instance=instance)
        .filter(
            DerivedResult.type.in_(result_types),
            DerivedResult.artifact_set_id == artifact_set_id,
        )
        .order_by(DerivedResult.id.desc())
        .all()
    )
    latest: dict[str, DerivedResult] = {}
    for row in rows:
        latest.setdefault(row.type, row)
    return latest


def _latest_rows_by_type(
    *, db: Session, study: Study, instance: Instance, result_types: list[str]
) -> dict[str, DerivedResult]:
    if not result_types:
        return {}
    rows = (
        _overlay_base_query(db=db, study=study, instance=instance)
        .filter(DerivedResult.type.in_(result_types))
        .order_by(DerivedResult.id.desc())
        .all()
    )
    latest: dict[str, DerivedResult] = {}
    for row in rows:
        latest.setdefault(row.type, row)
    return latest


def _latest_row_for_artifact_set(
    *, db: Session, study: Study, instance: Instance, result_type: str, artifact_set_id: int
) -> Optional[DerivedResult]:
    return (
        _overlay_base_query(db=db, study=study, instance=instance)
        .filter(
            DerivedResult.type == result_type,
            DerivedResult.artifact_set_id == artifact_set_id,
        )
        .order_by(DerivedResult.id.desc())
        .first()
    )


def resolve_overlay_row(
    *,
    db: Session,
    study: Study,
    instance: Instance,
    overlay_type: str,
    preview: bool,
    overlay_key: str | None = None,
) -> Optional[DerivedResult]:
    result_type = _result_type_for_overlay(
        overlay_type=overlay_type,
        overlay_key=overlay_key,
    )
    if result_type is None:
        return None

    # Part 1. Prefer latest draft row only when preview mode requests it.
    if preview:
        draft_set = get_latest_draft_artifact_set(db=db, study_id=study.id)
        if draft_set:
            draft_row = _latest_row_for_artifact_set(
                db=db,
                study=study,
                instance=instance,
                result_type=result_type,
                artifact_set_id=draft_set.id,
            )
            if draft_row:
                return draft_row

    # Part 2. Active artifacts are the normal read source and block legacy fallback.
    active_set = get_active_artifact_set(db=db, study_id=study.id)
    if active_set:
        return _latest_row_for_artifact_set(
            db=db,
            study=study,
            instance=instance,
            result_type=result_type,
            artifact_set_id=active_set.id,
        )

    # Part 3. Legacy/latest fallback exists only before active artifact sets exist.
    return (
        _overlay_base_query(db=db, study=study, instance=instance)
        .filter(DerivedResult.type == result_type)
        .order_by(DerivedResult.id.desc())
        .first()
    )


def resolve_overlay_rows(
    *, db: Session, study: Study, instance: Instance, preview: bool
) -> list[DerivedResult]:
    result_types = _candidate_result_types(db=db, study=study, instance=instance)
    selected_by_type: dict[str, DerivedResult] = {}

    # Part 1. Prefer latest draft rows when preview mode requests them.
    if preview:
        draft_set = get_latest_draft_artifact_set(db=db, study_id=study.id)
        if draft_set:
            selected_by_type.update(
                _latest_rows_by_type_for_artifact_set(
                    db=db,
                    study=study,
                    instance=instance,
                    result_types=result_types,
                    artifact_set_id=draft_set.id,
                )
            )

    # Part 2. Active artifacts are the normal read source and block legacy fallback.
    missing_result_types = [
        result_type for result_type in result_types if result_type not in selected_by_type
    ]
    active_set = get_active_artifact_set(db=db, study_id=study.id)
    if active_set:
        selected_by_type.update(
            _latest_rows_by_type_for_artifact_set(
                db=db,
                study=study,
                instance=instance,
                result_types=missing_result_types,
                artifact_set_id=active_set.id,
            )
        )
    else:
        selected_by_type.update(
            _latest_rows_by_type(
                db=db,
                study=study,
                instance=instance,
                result_types=missing_result_types,
            )
        )

    return [
        selected_by_type[result_type]
        for result_type in result_types
        if result_type in selected_by_type
    ]


def overlay_status(row: Optional[DerivedResult]) -> str:
    if row is None:
        return "not_available"
    if row.status == ResultStatus.failed:
        return "failed"
    if row.status == ResultStatus.pending:
        return "running"
    if row.status == ResultStatus.complete:
        return "completed"
    return "not_available"


def structured_overlay_document(
    *, row: Optional[DerivedResult], overlay_type: str, overlay_key: str | None = None
) -> Optional[Dict[str, Any]]:
    if _result_type_for_overlay(overlay_type=overlay_type, overlay_key=overlay_key) is None:
        return None
    if not row or not isinstance(row.value_json, dict):
        return None
    if row.value_json.get("kind") != _SUPPORTED_KIND_BY_TYPE.get(overlay_type):
        return None
    return row.value_json


def _document_has_geometry(*, doc: dict[str, Any], overlay_type: str) -> bool:
    if overlay_type == DOPPLER_MEASUREMENT_OVERLAY_TYPE:
        return bool(doc.get("points"))
    return bool(doc.get("frames"))


def _measurement_summary(
    *, doc: dict[str, Any], overlay_type: str, overlay_key: str | None
) -> dict[str, Any]:
    measurement = doc.get("measurement")
    if isinstance(measurement, dict):
        return {
            "measurement_name": measurement.get("name"),
            "measurement_value": measurement.get("value"),
            "measurement_units": measurement.get("units"),
        }

    if overlay_type == LINEAR_MEASUREMENT_OVERLAY_TYPE:
        quality = doc.get("quality") if isinstance(doc.get("quality"), dict) else {}
        value = quality.get("max_length_cm")
        return {
            "measurement_name": overlay_key,
            "measurement_value": value,
            "measurement_units": "cm" if value is not None else None,
        }

    return {
        "measurement_name": None,
        "measurement_value": None,
        "measurement_units": None,
    }


def _confidence_summary(*, doc: dict[str, Any], overlay_type: str) -> dict[str, Any]:
    quality = doc.get("quality") if isinstance(doc.get("quality"), dict) else {}

    if overlay_type == LV_SEGMENTATION_OVERLAY_TYPE:
        confidence_score = quality.get("confidence_score", quality.get("mean_confidence"))
        return {
            "confidence_score": confidence_score,
            "confidence_source": quality.get("confidence_source")
            or "foreground_probability_mean",
            "confidence_threshold": quality.get("confidence_threshold"),
            "low_confidence": bool(quality.get("low_confidence", False)),
        }

    return {
        "confidence_score": quality.get("confidence_score"),
        "confidence_source": quality.get("confidence_source"),
        "confidence_threshold": quality.get("confidence_threshold"),
        "low_confidence": bool(quality.get("low_confidence", False)),
    }


def overlay_metadata(
    *,
    sop_instance_uid: str,
    instance_id: int,
    overlay_type: str,
    row: Optional[DerivedResult],
    overlay_key: str | None = None,
) -> Dict[str, Any]:
    doc = row.value_json if (row and isinstance(row.value_json, dict)) else {}
    quality = doc.get("quality") if isinstance(doc.get("quality"), dict) else {}
    resolved_overlay_key = doc.get("overlay_key") or overlay_key
    structured = doc.get("kind") == _SUPPORTED_KIND_BY_TYPE.get(overlay_type)
    measurement = _measurement_summary(
        doc=doc,
        overlay_type=overlay_type,
        overlay_key=resolved_overlay_key,
    )
    display = overlay_display_metadata(
        doc=doc,
        overlay_type=overlay_type,
        overlay_key=resolved_overlay_key,
        measurement=measurement,
    )
    confidence = _confidence_summary(doc=doc, overlay_type=overlay_type)

    return {
        "sop_instance_uid": sop_instance_uid,
        "instance_id": instance_id,
        "overlay_type": overlay_type,
        "overlay_key": resolved_overlay_key,
        "kind": doc.get("kind"),
        "structured": structured,
        "status": overlay_status(row),
        "available": bool(
            structured and _document_has_geometry(doc=doc, overlay_type=overlay_type)
        ),
        "model_name": doc.get("model_name") or (row.model_name if row else None),
        "model_version": doc.get("model_version") or (row.model_version if row else None),
        "frame_count": doc.get("frame_count"),
        "frame_width": doc.get("frame_width"),
        "frame_height": doc.get("frame_height"),
        "fps": doc.get("fps"),
        "geometry_type": doc.get("geometry_type"),
        "mask_format": doc.get("mask_format"),
        "mean_confidence": quality.get("mean_confidence"),
        "frames_with_mask": quality.get("frames_with_mask"),
        **measurement,
        **display,
        **confidence,
        "warnings": quality.get("warnings") or [],
        "generated_at": doc.get("generated_at"),
        "payload_url": payload_url_for(
            sop_instance_uid=sop_instance_uid,
            overlay_type=overlay_type,
            overlay_key=resolved_overlay_key,
        ),
    }


def overlay_instance_summary(
    *, instance: Instance, overlays: list[dict[str, Any]]
) -> dict[str, Any]:
    running_count = sum(
        1 for overlay in overlays if overlay.get("status") in {"queued", "running"}
    )
    failed_count = sum(1 for overlay in overlays if overlay.get("status") == "failed")
    available_count = sum(1 for overlay in overlays if overlay.get("available"))
    low_confidence_count = sum(
        1
        for overlay in overlays
        if overlay.get("available") and overlay.get("low_confidence")
    )

    if running_count:
        overlay_status = "processing"
    elif available_count and failed_count:
        overlay_status = "partial"
    elif available_count:
        overlay_status = "ready"
    elif failed_count:
        overlay_status = "failed"
    else:
        overlay_status = "none"

    return {
        "sop_instance_uid": instance.sop_instance_uid,
        "instance_id": instance.id,
        "predicted_view": instance.predicted_view,
        "predicted_view_label": predicted_view_label(instance.predicted_view),
        "predicted_view_confidence": instance.predicted_view_confidence,
        "overlay_status": overlay_status,
        "overlay_count": available_count,
        "available_overlay_count": available_count,
        "running_overlay_count": running_count,
        "failed_overlay_count": failed_count,
        "low_confidence_count": low_confidence_count,
    }
