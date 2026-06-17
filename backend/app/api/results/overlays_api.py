from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.artifacts import OVERLAYS_ROUTE_SEGMENT
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
    overlay_key_for_result_type,
    overlay_type_for_result_type,
    resolve_overlay_row,
    resolve_overlay_rows,
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
        rows = resolve_overlay_rows(
            db=db,
            study=study,
            instance=instance,
            preview=preview,
        )
        for row in rows:
            overlay_type = overlay_type_for_result_type(row.type)
            if overlay_type is None:
                continue
            overlays.append(
                OverlayMetadata(
                    **overlay_metadata(
                        sop_instance_uid=instance.sop_instance_uid,
                        instance_id=instance.id,
                        overlay_type=overlay_type,
                        overlay_key=overlay_key_for_result_type(row.type),
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
    rows = resolve_overlay_rows(
        db=db,
        study=study,
        instance=instance,
        preview=preview,
    )
    overlays = []
    for row in rows:
        overlay_type = overlay_type_for_result_type(row.type)
        if overlay_type is None:
            continue
        overlays.append(
            OverlayMetadata(
                **overlay_metadata(
                    sop_instance_uid=sop_instance_uid,
                    instance_id=instance.id,
                    overlay_type=overlay_type,
                    overlay_key=overlay_key_for_result_type(row.type),
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
    return _overlay_payload_response(
        sop_instance_uid=sop_instance_uid,
        overlay_type=overlay_type,
        overlay_key=None,
        preview=preview,
        db=db,
        current_principal=current_principal,
    )


@router.get(
    f"/instances/{{sop_instance_uid}}/{OVERLAYS_ROUTE_SEGMENT}/{{overlay_type}}/{{overlay_key}}/payload",
    response_model=None,
)
def get_instance_keyed_overlay_payload(
    sop_instance_uid: str,
    overlay_type: str,
    overlay_key: str,
    preview: bool = Query(False, description="Prefer latest draft artifacts when available"),
    db: Session = Depends(get_db),
    current_principal: dict[str, object] = Depends(get_current_study_read_principal),
):
    # Part 4. Measurement overlays are addressed by overlay type plus overlay key.
    return _overlay_payload_response(
        sop_instance_uid=sop_instance_uid,
        overlay_type=overlay_type,
        overlay_key=overlay_key,
        preview=preview,
        db=db,
        current_principal=current_principal,
    )


def _overlay_payload_response(
    *,
    sop_instance_uid: str,
    overlay_type: str,
    overlay_key: str | None,
    preview: bool,
    db: Session,
    current_principal: dict[str, object],
):
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
        overlay_key=overlay_key,
        preview=preview,
    )
    document = structured_overlay_document(
        row=row,
        overlay_type=overlay_type,
        overlay_key=overlay_key,
    )
    if document is None:
        raise HTTPException(status_code=404, detail="Overlay payload not found")

    return JSONResponse(content=document)
