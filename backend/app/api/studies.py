from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import logging

from app.database.db import get_db
from app.models.studies import Study
from app.models.derived_results import DerivedResult
from app.services.orthanc_client import delete_study_from_orthanc

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/studies")
def list_studies(db: Session = Depends(get_db)):
    # Pull simple fields directly; EF from cached column (fallback to latest result)
    rows = db.query(Study).order_by(Study.uploaded_at.desc()).limit(200).all()
    data = []
    for s in rows:
        ef = getattr(s, "ef_value", None)
        if ef is None:
            # Fallback look-up (if you didn’t backfill ef_value yet)
            dr = (
                db.query(DerivedResult)
                .filter(DerivedResult.study_id == s.id, DerivedResult.type == "EF")
                .order_by(DerivedResult.created_at.desc())
                .first()
            )
            ef = dr.value_numeric if dr else None
        data.append({
            "id": s.id,
            "instance_id": s.instance_id,
            "patient_id": s.patient_id,
            "study_uid": s.study_uid,
            "study_date": s.study_date,
            "status": getattr(s, "status", None) or "ready",
            "ef": ef,
        })
    return data


@router.patch("/studies/{study_id}")
def update_study(study_id: int, payload: dict, db: Session = Depends(get_db)):
    s = db.query(Study).get(study_id)
    if not s:
        raise HTTPException(status_code=404, detail="Study not found")
    # allow light edits
    for key in ["patient_id", "study_date"]:
        if key in payload:
            setattr(s, key, payload[key])
    if "notes" in payload and hasattr(s, "notes"):
        s.notes = payload["notes"]
    db.commit()
    return {"ok": True}


@router.delete("/studies/{study_id}")
def delete_study(study_id: int, db: Session = Depends(get_db)):
    study = db.query(Study).get(study_id)
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    # Delete from orthanc firsy using StudyInstanceUID
    if study.study_uid:
        deleted = delete_study_from_orthanc(study.study_uid)
        if not deleted:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete study {study_id} from Orthanc. Database not modified."
            )
    
    # Delete from Database
    try:
        db.delete(study)
        db.commit()
        logger.info(f"Study {study_id} deleted from database and Orthanc")
    except SQLAlchemyError as err:
        db.rollback()
        logger.error(f"Failed to delete study {study_id} from database: {str(err)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete study {study_id} from database after Orthanc deletion"
        )
    
    return {"ok": True, "message": "Study deleted from DB an Orthanc"}


@router.get("/studies/{study_uid}/derived-results")
def list_derived_results(study_uid: str, db: Session = Depends(get_db)):
    """
    Lists the derived results of the study from the database
    """
    s = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not s:
        raise HTTPException(status_code=404, detail="Study not found")
    
    results = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == s.id)
        .order_by(DerivedResult.created_at.desc())
        .all()
    )

    return [
        {
            "id": r.id,
            "type": r.type,
            "value_numeric": r.value_numeric,
            "value_json": r.value_json,
            "created_at": r.created_at,
        }
        for r in results
    ]
