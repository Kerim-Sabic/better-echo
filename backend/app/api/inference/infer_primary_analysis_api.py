from typing import Any, Dict

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.schemas.inference.infer_primary_analysis_schemas import (
    InferPrimaryAnalysisRequest,
    PrimaryAnalysisResponse,
)
from app.services.inference.primary_analysis_service import run_primary_analysis_metrics

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/infer/primary-analysis", response_model=PrimaryAnalysisResponse)
def infer_primary_analysis(
    payload: InferPrimaryAnalysisRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Run primary analysis inference using a study UID and return study-level aggregated results.
    """
    try:
        return run_primary_analysis_metrics(
            study_uid=payload.study_uid,
            db=db,
            include_instance_orthanc_ids=payload.include_instance_orthanc_ids,
            artifact_set_id=payload.artifact_set_id,
        )
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except Exception as err:
        logger.exception("[PRIMARY_ANALYSIS] Inference failed: %s: %s", type(err).__name__, err)
        raise HTTPException(
            status_code=500,
            detail=f"Inference failed: {type(err).__name__}: {err}",
        )
