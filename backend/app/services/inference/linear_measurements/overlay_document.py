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
    warnings: list[str] = []
    if not lengths:
        warnings.append("dicom_scale_unavailable_length_cm_omitted")

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
    "MODEL_VERSION",
    "build_overlay_document",
    "is_structured_overlay",
    "persist_overlay_result",
]
