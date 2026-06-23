from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.artifacts import (
    DOPPLER_MEASUREMENT_OVERLAY_KIND,
    DOPPLER_MEASUREMENT_OVERLAY_SCHEMA_VERSION,
    DOPPLER_MEASUREMENT_OVERLAY_TYPE,
    SPECTRAL_MEASUREMENTS_MODEL_NAME,
    spectral_measurements_result_type,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.instances import Instance

MODEL_VERSION = "v1"


# Part 1. Build the persisted Doppler selected-frame overlay payload.
def build_overlay_document(
    *,
    instance: Instance,
    model_weights: str,
    prediction: dict[str, Any],
    duration_s: float,
) -> dict[str, Any]:
    frame_selection = prediction.get("frame_selection") or {}
    points = prediction.get("points") or []
    quality = prediction.get("quality") or {}
    quality.setdefault(
        "confidence_source",
        "point_heatmap_peak_min" if len(points) > 1 else "point_heatmap_peak",
    )
    return {
        "schema_version": DOPPLER_MEASUREMENT_OVERLAY_SCHEMA_VERSION,
        "overlay_type": DOPPLER_MEASUREMENT_OVERLAY_TYPE,
        "overlay_key": model_weights,
        "kind": DOPPLER_MEASUREMENT_OVERLAY_KIND,
        "sop_instance_uid": instance.sop_instance_uid,
        "instance_id": instance.id,
        "model_name": SPECTRAL_MEASUREMENTS_MODEL_NAME,
        "model_version": MODEL_VERSION,
        "frame_count": 1,
        "source_frame_count": frame_selection.get("num_frames"),
        "frame_width": int(prediction["frame_width"]),
        "frame_height": int(prediction["frame_height"]),
        "coordinate_space": "source_pixel",
        "geometry_type": prediction.get("geometry_type") or "point_marker",
        "selected_frame_index": int(prediction.get("selected_frame_index") or 0),
        "points": points,
        "segments": prediction.get("segments") or [],
        "reference_line": prediction.get("reference_line"),
        "measurement": {
            "name": prediction.get("metric_name"),
            "value": prediction.get("metric_value"),
            "units": prediction.get("units"),
        },
        "doppler_region": prediction.get("doppler_region") or {},
        "frame_selection": frame_selection,
        "quality": quality,
        "metadata": prediction.get("metadata") or {},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "processing": {
            "duration_s": round(float(duration_s), 2),
        },
    }


# Part 2. Upsert the Doppler overlay row for the current artifact scope.
def persist_overlay_result(
    *,
    db: Session,
    instance: Instance,
    model_weights: str,
    artifact_set_id: int | None,
    document: dict[str, Any],
) -> DerivedResult:
    result_type = spectral_measurements_result_type(model_weights)
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
            model_name=SPECTRAL_MEASUREMENTS_MODEL_NAME,
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
        and value_json.get("kind") == DOPPLER_MEASUREMENT_OVERLAY_KIND
    )


__all__ = [
    "MODEL_VERSION",
    "build_overlay_document",
    "is_structured_overlay",
    "persist_overlay_result",
]
