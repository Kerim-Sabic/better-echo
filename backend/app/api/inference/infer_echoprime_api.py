from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import logging

from app.database.db import get_db
from app.schemas.inference.infer_echoprime_schemas import EchoPrimeResponse, InferEchoPrimeRequest
from app.schemas.inference.infer_echoprime_views_schemas import EchoPrimeViewsResponse, InferEchoPrimeViewsRequest
from app.services.inference.echoprime_service import (
    classify_views_for_study,
    run_echoprime_metrics,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Part 1. Metrics-only EchoPrime route.
@router.post("/infer/echoprime", response_model=EchoPrimeResponse)
def infer_echoprime(
    payload: InferEchoPrimeRequest,
    db: Session = Depends(get_db),
    ) -> Dict[str, Any]:
    """
    Run EchoPrime metrics inference only (no view-classification persistence).
    """
    try:
        return run_echoprime_metrics(
            study_uid=payload.study_uid,
            db=db,
            include_instance_orthanc_ids=payload.include_instance_orthanc_ids,
            artifact_set_id=payload.artifact_set_id,
        )
    except Exception as e:
        logger.exception(f"[EchoPrime] Inference failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"EchoPrime inference failed: {type(e).__name__}: {e}")


# Part 2. View-classification-only EchoPrime route for QA/Swagger workflows.
@router.post("/infer/echoprime/views", response_model=EchoPrimeViewsResponse)
def infer_echoprime_views(
    payload: InferEchoPrimeViewsRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Run EchoPrime view classification only and persist predicted_view fields.
    """
    try:
        view_map = classify_views_for_study(
            payload.study_uid,
            db,
            include_file_paths=payload.include_file_paths,
        )
        updated = len(view_map)
        return {
            "study_uid": payload.study_uid,
            "num_instances": updated,
            "updated_instances": updated,
            "views": view_map,
        }
    except Exception as e:
        logger.exception(f"[EchoPrime] View classification failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"EchoPrime view classification failed: {type(e).__name__}: {e}")

