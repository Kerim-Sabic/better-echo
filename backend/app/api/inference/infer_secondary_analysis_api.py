from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import logging

from app.database.db import get_db
from app.schemas.inference.infer_secondary_analysis_schemas import (
    InferSecondaryAnalysisRequest,
    SecondaryAnalysisResponse,
)
from app.schemas.inference.infer_secondary_analysis_views_schemas import (
    InferSecondaryAnalysisViewsRequest,
    SecondaryAnalysisViewsResponse,
)
from app.services.inference.secondary_analysis_service import (
    classify_views_for_study,
    run_secondary_analysis_metrics,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Part 1. Metrics-only secondary analysis route.
@router.post("/infer/secondary-analysis", response_model=SecondaryAnalysisResponse)
def infer_secondary_analysis(
    payload: InferSecondaryAnalysisRequest,
    db: Session = Depends(get_db),
    ) -> Dict[str, Any]:
    """
    Run secondary analysis metrics inference only (no view-classification persistence).
    """
    try:
        return run_secondary_analysis_metrics(
            study_uid=payload.study_uid,
            db=db,
            include_instance_orthanc_ids=payload.include_instance_orthanc_ids,
            artifact_set_id=payload.artifact_set_id,
        )
    except Exception as e:
        logger.exception("[SecondaryAnalysis] Inference failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=500, detail=f"Secondary analysis inference failed: {type(e).__name__}: {e}")


# Part 2. View-classification-only secondary analysis route for QA/support workflows.
@router.post("/infer/secondary-analysis/views", response_model=SecondaryAnalysisViewsResponse)
def infer_secondary_analysis_views(
    payload: InferSecondaryAnalysisViewsRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Run secondary analysis view classification only and persist predicted_view fields.
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
        logger.exception("[SecondaryAnalysis] View classification failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=500, detail=f"Secondary analysis view classification failed: {type(e).__name__}: {e}")

