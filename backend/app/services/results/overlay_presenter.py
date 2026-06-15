from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.artifacts import (
    LV_SEGMENTATION_OVERLAY_KIND,
    LV_SEGMENTATION_OVERLAY_TYPE,
    MOTION_SEGMENTATION_TYPE,
    OVERLAYS_ROUTE_SEGMENT,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.instances import Instance
from app.database_models.studies import Study
from app.services.pipeline.read import (
    get_active_artifact_set,
    get_latest_draft_artifact_set,
)

SUPPORTED_OVERLAY_TYPES = (LV_SEGMENTATION_OVERLAY_TYPE,)


def payload_url_for(*, sop_instance_uid: str, overlay_type: str) -> str:
    return f"/api/instances/{sop_instance_uid}/{OVERLAYS_ROUTE_SEGMENT}/{overlay_type}/payload"


def _overlay_base_query(*, db: Session, study: Study, instance: Instance):
    return db.query(DerivedResult).filter(
        DerivedResult.study_id == study.id,
        DerivedResult.instance_id == instance.id,
        DerivedResult.type == MOTION_SEGMENTATION_TYPE,
    )


def _latest_row_for_artifact_set(
    *, db: Session, study: Study, instance: Instance, artifact_set_id: int
) -> Optional[DerivedResult]:
    return (
        _overlay_base_query(db=db, study=study, instance=instance)
        .filter(DerivedResult.artifact_set_id == artifact_set_id)
        .order_by(DerivedResult.id.desc())
        .first()
    )


def resolve_overlay_row(
    *, db: Session, study: Study, instance: Instance, overlay_type: str, preview: bool
) -> Optional[DerivedResult]:
    if overlay_type != LV_SEGMENTATION_OVERLAY_TYPE:
        return None

    # Part 1. Prefer latest draft row only when preview mode requests it.
    if preview:
        draft_set = get_latest_draft_artifact_set(db=db, study_id=study.id)
        if draft_set:
            draft_row = _latest_row_for_artifact_set(
                db=db,
                study=study,
                instance=instance,
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
            artifact_set_id=active_set.id,
        )

    # Part 3. Legacy/latest fallback exists only before active artifact sets exist.
    return (
        _overlay_base_query(db=db, study=study, instance=instance)
        .order_by(DerivedResult.id.desc())
        .first()
    )


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
    *, row: Optional[DerivedResult], overlay_type: str
) -> Optional[Dict[str, Any]]:
    if overlay_type != LV_SEGMENTATION_OVERLAY_TYPE:
        return None
    if not row or not isinstance(row.value_json, dict):
        return None
    if row.value_json.get("kind") != LV_SEGMENTATION_OVERLAY_KIND:
        return None
    return row.value_json


def overlay_metadata(
    *, sop_instance_uid: str, instance_id: int, overlay_type: str, row: Optional[DerivedResult]
) -> Dict[str, Any]:
    doc = row.value_json if (row and isinstance(row.value_json, dict)) else {}
    quality = doc.get("quality") if isinstance(doc.get("quality"), dict) else {}
    structured = doc.get("kind") == LV_SEGMENTATION_OVERLAY_KIND

    return {
        "sop_instance_uid": sop_instance_uid,
        "instance_id": instance_id,
        "overlay_type": overlay_type,
        "kind": doc.get("kind"),
        "structured": structured,
        "status": overlay_status(row),
        "available": bool(structured and doc.get("frames")),
        "model_name": doc.get("model_name") or (row.model_name if row else None),
        "model_version": doc.get("model_version") or (row.model_version if row else None),
        "frame_count": doc.get("frame_count"),
        "frame_width": doc.get("frame_width"),
        "frame_height": doc.get("frame_height"),
        "fps": doc.get("fps"),
        "mask_format": doc.get("mask_format"),
        "mean_confidence": quality.get("mean_confidence"),
        "frames_with_mask": quality.get("frames_with_mask"),
        "warnings": quality.get("warnings") or [],
        "generated_at": doc.get("generated_at"),
        "payload_url": payload_url_for(
            sop_instance_uid=sop_instance_uid,
            overlay_type=overlay_type,
        ),
    }
