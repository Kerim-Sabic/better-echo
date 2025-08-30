from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.models.study import Study
from app.models.derived_result import DerivedResult

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
    s = db.query(Study).get(study_id)
    if not s:
        return {"ok": True}
    db.delete(s)     # will cascade to derived_results if FK is set
    db.commit()
    return {"ok": True}


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
