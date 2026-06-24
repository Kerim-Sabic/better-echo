from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.artifacts import (
    LV_SEGMENTATION_OVERLAY_KIND,
    LV_SEGMENTATION_OVERLAY_SCHEMA_VERSION,
    LV_SEGMENTATION_OVERLAY_TYPE,
    MOTION_SEGMENTATION_MODEL_NAME,
    MOTION_SEGMENTATION_TYPE,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.instances import Instance
from app.helpers.media.mask_rle import RLE_FORMAT

MODEL_VERSION = "v1"


# Part 1. Build the persisted overlay payload.
def build_overlay_document(
    *,
    instance: Instance,
    frame_results: list[dict[str, Any]],
    frame_width: int,
    frame_height: int,
    fps: float,
    device_type: str,
    duration_s: float,
) -> dict[str, Any]:
    frames_with_mask = sum(1 for frame in frame_results if frame.get("present"))
    confidences = [
        float(frame.get("confidence") or 0.0)
        for frame in frame_results
        if frame.get("present")
    ]
    mean_confidence = (
        round(sum(confidences) / len(confidences), 4) if confidences else 0.0
    )

    warnings: list[str] = []
    if frame_results and frames_with_mask == 0:
        warnings.append("no_lv_detected_in_any_frame")

    return {
        "schema_version": LV_SEGMENTATION_OVERLAY_SCHEMA_VERSION,
        "overlay_type": LV_SEGMENTATION_OVERLAY_TYPE,
        "kind": LV_SEGMENTATION_OVERLAY_KIND,
        "sop_instance_uid": instance.sop_instance_uid,
        "instance_id": instance.id,
        "model_name": MOTION_SEGMENTATION_MODEL_NAME,
        "model_version": MODEL_VERSION,
        "frame_count": len(frame_results),
        "frame_width": int(frame_width),
        "frame_height": int(frame_height),
        "fps": round(float(fps), 3),
        "mask_format": RLE_FORMAT,
        "mask_resolution": [int(frame_width), int(frame_height)],
        "frames": frame_results,
        "quality": {
            "frames_with_mask": frames_with_mask,
            "mean_confidence": mean_confidence,
            "confidence_score": mean_confidence,
            "confidence_source": "foreground_probability_mean",
            "confidence_threshold": None,
            "low_confidence": False,
            "warnings": warnings,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "processing": {
            "device": device_type,
            "duration_s": round(float(duration_s), 2),
        },
    }


# Part 2. Upsert the overlay row for the current artifact scope.
def persist_overlay_result(
    *,
    db: Session,
    instance: Instance,
    artifact_set_id: int | None,
    document: dict[str, Any],
) -> DerivedResult:
    query = db.query(DerivedResult).filter(
        DerivedResult.instance_id == instance.id,
        DerivedResult.type == MOTION_SEGMENTATION_TYPE,
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
            type=MOTION_SEGMENTATION_TYPE,
            model_name=MOTION_SEGMENTATION_MODEL_NAME,
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
        and value_json.get("kind") == LV_SEGMENTATION_OVERLAY_KIND
    )


__all__ = [
    "MODEL_VERSION",
    "build_overlay_document",
    "is_structured_overlay",
    "persist_overlay_result",
]
