from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.artifacts import LV_SEGMENTATION_OVERLAY_TYPE, OVERLAYS_ROUTE_SEGMENT
from app.database.db import get_db
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.schemas.results.overlays_schemas import (
    InstanceOverlaysResponse,
    OverlayMetadata,
    StudyOverlaysResponse,
)
from app.services.auth.principal_service import get_current_study_read_principal
from app.services.pipeline.read import get_study_or_404_for_principal
from app.services.results.overlay_presenter import (
    SUPPORTED_OVERLAY_TYPES,
    overlay_metadata,
    resolve_overlay_row,
    structured_overlay_document,
)

router = APIRouter()


def _instance_or_404(*, db: Session, sop_instance_uid: str) -> Instance:
    instance = db.query(Instance).filter(Instance.sop_instance_uid == sop_instance_uid).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")
    return instance


def _authorized_study_for_instance(
    *, db: Session, instance: Instance, current_principal: dict[str, object]
):
    study = instance.series.study if instance.series else None
    if study is None:
        raise HTTPException(status_code=404, detail="Instance has no study")
    return get_study_or_404_for_principal(
        db=db,
        study_uid=study.study_uid,
        current_principal=current_principal,
    )


@router.get(
    f"/studies/{{study_uid}}/{OVERLAYS_ROUTE_SEGMENT}",
    response_model=StudyOverlaysResponse,
)
def list_study_overlays(
    study_uid: str,
    preview: bool = Query(False, description="Prefer latest draft artifacts when available"),
    db: Session = Depends(get_db),
    current_principal: dict[str, object] = Depends(get_current_study_read_principal),
):
    # Part 1. Resolve authorized study and shape per-instance overlay metadata.
    study = get_study_or_404_for_principal(
        db=db,
        study_uid=study_uid,
        current_principal=current_principal,
    )
    instances = (
        db.query(Instance)
        .join(Series, Instance.series_id == Series.id)
        .filter(Series.study_id == study.id)
        .all()
    )

    overlays = []
    for instance in instances:
        row = resolve_overlay_row(
            db=db,
            study=study,
            instance=instance,
            overlay_type=LV_SEGMENTATION_OVERLAY_TYPE,
            preview=preview,
        )
        if row is None:
            continue
        overlays.append(
            OverlayMetadata(
                **overlay_metadata(
                    sop_instance_uid=instance.sop_instance_uid,
                    instance_id=instance.id,
                    overlay_type=LV_SEGMENTATION_OVERLAY_TYPE,
                    row=row,
                )
            )
        )

    return StudyOverlaysResponse(study_uid=study_uid, overlays=overlays)


@router.get(
    f"/instances/{{sop_instance_uid}}/{OVERLAYS_ROUTE_SEGMENT}",
    response_model=InstanceOverlaysResponse,
)
def list_instance_overlays(
    sop_instance_uid: str,
    preview: bool = Query(False, description="Prefer latest draft artifacts when available"),
    db: Session = Depends(get_db),
    current_principal: dict[str, object] = Depends(get_current_study_read_principal),
):
    # Part 2. Resolve authorized instance and expose currently supported overlay metadata.
    instance = _instance_or_404(db=db, sop_instance_uid=sop_instance_uid)
    study = _authorized_study_for_instance(
        db=db,
        instance=instance,
        current_principal=current_principal,
    )
    row = resolve_overlay_row(
        db=db,
        study=study,
        instance=instance,
        overlay_type=LV_SEGMENTATION_OVERLAY_TYPE,
        preview=preview,
    )
    overlays = []
    if row is not None:
        overlays.append(
            OverlayMetadata(
                **overlay_metadata(
                    sop_instance_uid=sop_instance_uid,
                    instance_id=instance.id,
                    overlay_type=LV_SEGMENTATION_OVERLAY_TYPE,
                    row=row,
                )
            )
        )

    return InstanceOverlaysResponse(sop_instance_uid=sop_instance_uid, overlays=overlays)


@router.get(
    f"/instances/{{sop_instance_uid}}/{OVERLAYS_ROUTE_SEGMENT}/{{overlay_type}}/payload",
    response_model=None,
)
def get_instance_overlay_payload(
    sop_instance_uid: str,
    overlay_type: str,
    preview: bool = Query(False, description="Prefer latest draft artifacts when available"),
    db: Session = Depends(get_db),
    current_principal: dict[str, object] = Depends(get_current_study_read_principal),
):
    # Part 3. Return the persisted structured document without wrapping it.
    if overlay_type not in SUPPORTED_OVERLAY_TYPES:
        raise HTTPException(status_code=404, detail="Overlay type not found")

    instance = _instance_or_404(db=db, sop_instance_uid=sop_instance_uid)
    study = _authorized_study_for_instance(
        db=db,
        instance=instance,
        current_principal=current_principal,
    )
    row = resolve_overlay_row(
        db=db,
        study=study,
        instance=instance,
        overlay_type=overlay_type,
        preview=preview,
    )
    document = structured_overlay_document(row=row, overlay_type=overlay_type)
    if document is None:
        raise HTTPException(status_code=404, detail="Overlay payload not found")

    return JSONResponse(content=document)
