from __future__ import annotations
from typing import Optional
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.models.studies import Study
from app.models.derived_results import DerivedResult
from app.core.artifacts import COMBINED_TYPE
from app.background_tasks.combining_panecho_echoprime import combining_panecho_echoprime
from app.helpers.combined_results_row_to_dict import build_combined_sections_from_row

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/studies/{study_uid}/PanEcho-EchoPrime-combined-results")
def get_combined_results(
    study_uid: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Read-only endpoint for the Study Results page.
    Part 1. Check if combined results exists for the study; if yes, return it.
    Part 2. If not, schedule background orchestration and return 202 {pending}.
    """
    # --- Part 1. Lookup study + combined row ---
    study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")
    
    combined_results_row = (
        db.query(DerivedResult)
        .filter(DerivedResult.study_id == study.id, DerivedResult.type == COMBINED_TYPE)
        .first()
    )

    if combined_results_row:
        payload = build_combined_sections_from_row(combined_results_row)
        return {"status": "complete", "panecho_echoprime_results": payload}
    
    # --- Part 2. Not found -> trigger background task and return pending ---
    background_tasks.add_task(combining_panecho_echoprime, study_uid)
    return JSONResponse(
        {"status": "pending", "retryAfter": 3},
        status_code=202
    )