from fastapi import APIRouter, HTTPException
from db import SessionLocal
from models.study import Study
from models.derived_result import DerivedResult

router = APIRouter()

@router.get("/studies")
def list_studies():
    db = SessionLocal()
    try:
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
    finally:
        db.close()

@router.patch("/studies/{study_id}")
def update_study(study_id: int, payload: dict):
    db = SessionLocal()
    try:
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
    finally:
        db.close()

@router.delete("/studies/{study_id}")
def delete_study(study_id: int):
    db = SessionLocal()
    try:
        s = db.query(Study).get(study_id)
        if not s:
            return {"ok": True}
        db.delete(s)     # will cascade to derived_results if FK is set
        db.commit()
        return {"ok": True}
    finally:
        db.close()
