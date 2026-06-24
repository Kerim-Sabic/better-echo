from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.artifacts import (
    LINEAR_MEASUREMENT_OVERLAY_KIND,
    LINEAR_MEASUREMENT_OVERLAY_SCHEMA_VERSION,
    LINEAR_MEASUREMENT_OVERLAY_TYPE,
    LINEAR_MEASUREMENTS_MODEL_NAME,
    linear_measurements_result_type,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.instances import Instance

MODEL_VERSION = "v1"
LINEAR_CONFIDENCE_MIN = 0.05


def _cm_lengths(frames: list[dict[str, Any]]) -> list[float]:
    lengths: list[float] = []
    for frame in frames:
        measurement = frame.get("measurement")
        if not isinstance(measurement, dict):
            continue
        if measurement.get("units") != "cm":
            continue
        value = measurement.get("value")
        if isinstance(value, (int, float)):
            lengths.append(float(value))
    return lengths


def _frame_confidences(frames: list[dict[str, Any]]) -> list[float]:
    confidences: list[float] = []
    for frame in frames:
        value = frame.get("confidence")
        if isinstance(value, (int, float)):
            confidences.append(float(value))
    return confidences


# Part 1. Build the persisted 2D Linear overlay payload.
def build_overlay_document(
    *,
    instance: Instance,
    model_weights: str,
    frames: list[dict[str, Any]],
    frame_width: int,
    frame_height: int,
    fps: float,
    duration_s: float,
) -> dict[str, Any]:
    lengths = _cm_lengths(frames)
    confidences = _frame_confidences(frames)
    confidence_score = (
        round(sum(confidences) / len(confidences), 6)
        if confidences
        else None
    )
    low_confidence = bool(
        confidence_score is not None and confidence_score < LINEAR_CONFIDENCE_MIN
    )
    warnings: list[str] = []
    if not lengths:
        warnings.append("dicom_scale_unavailable_length_cm_omitted")
    if low_confidence:
        warnings.append("low_confidence")

    return {
        "schema_version": LINEAR_MEASUREMENT_OVERLAY_SCHEMA_VERSION,
        "overlay_type": LINEAR_MEASUREMENT_OVERLAY_TYPE,
        "overlay_key": model_weights,
        "kind": LINEAR_MEASUREMENT_OVERLAY_KIND,
        "sop_instance_uid": instance.sop_instance_uid,
        "instance_id": instance.id,
        "model_name": LINEAR_MEASUREMENTS_MODEL_NAME,
        "model_version": MODEL_VERSION,
        "frame_count": len(frames),
        "frame_width": int(frame_width),
        "frame_height": int(frame_height),
        "fps": round(float(fps), 3),
        "coordinate_space": "source_pixel",
        "geometry_type": "point_line",
        "frames": frames,
        "quality": {
            "frames_with_geometry": sum(1 for frame in frames if frame.get("present")),
            "min_length_cm": round(min(lengths), 4) if lengths else None,
            "max_length_cm": round(max(lengths), 4) if lengths else None,
            "confidence_score": confidence_score,
            "confidence_source": "point_heatmap_peak_mean",
            "confidence_threshold": LINEAR_CONFIDENCE_MIN,
            "low_confidence": low_confidence,
            "warnings": warnings,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "processing": {
            "duration_s": round(float(duration_s), 2),
        },
    }


# Part 2. Upsert the 2D Linear overlay row for the current artifact scope.
def persist_overlay_result(
    *,
    db: Session,
    instance: Instance,
    model_weights: str,
    artifact_set_id: int | None,
    document: dict[str, Any],
) -> DerivedResult:
    result_type = linear_measurements_result_type(model_weights)
    query = db.query(DerivedResult).filter(
        DerivedResult.instance_id == instance.id,
        DerivedResult.type == result_type,
    )
    if artifact_set_id is None:
        query = query.filter(DerivedResult.artifact_set_id.is_(None))
    else:
        query = query.filter(DerivedResult.artifact_set_id == artifact_set_id)

    row = query.first()
    if row is None:
        row = DerivedResult(
            study_id=instance.series.study.id,
            instance_id=instance.id,
            type=result_type,
            model_name=LINEAR_MEASUREMENTS_MODEL_NAME,
            model_version=MODEL_VERSION,
            artifact_set_id=artifact_set_id,
        )
        db.add(row)

    row.value_json = document
    row.model_version = MODEL_VERSION
    row.status = ResultStatus.complete
    db.commit()
    return row


def is_structured_overlay(value_json: Any) -> bool:
    return (
        isinstance(value_json, dict)
        and value_json.get("kind") == LINEAR_MEASUREMENT_OVERLAY_KIND
    )


__all__ = [
    "LINEAR_CONFIDENCE_MIN",
    "MODEL_VERSION",
    "build_overlay_document",
    "is_structured_overlay",
    "persist_overlay_result",
]
