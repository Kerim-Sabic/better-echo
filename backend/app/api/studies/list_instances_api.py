from typing import List

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import logging

from app.database.db import get_db
from app.database_models.studies import Study
from app.database_models.instances import Instance
from app.helpers.auth.authentication_functions import get_current_user_id
from app.schemas.studies.studies_schemas import InstanceResponse


logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/studies/{study_uid}/instances", response_model=List[InstanceResponse])
def list_instances(
    study_uid: str,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    List all instances for a given Study UID.

    Steps:
    1. Resolve the study by `study_uid` or return 404 if not found.
    2. Query all Instance rows for series that belong to that study.
    3. Return the list of instances, which Pydantic maps into `InstanceResponse` objects.
    """
    # --- Step 1. Find the study ---
    study = (
        db.query(Study)
        .filter(Study.study_uid == study_uid, Study.user_id == current_user_id)
        .first()
    )
    if not study:
        raise HTTPException(status_code=404, detail=f"Study with UID {study_uid} not found")

    # --- Step 2. Collect instances from all series under this study ---
    instances = (
        db.query(Instance)
        .join(Instance.series)
        .filter(Instance.series.has(study_id=study.id))
        .all()
    )

    return instances
