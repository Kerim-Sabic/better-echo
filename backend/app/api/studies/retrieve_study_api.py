import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.db import get_db
from app.database_models.studies import Study
from app.schemas.studies.studies_schemas import StudySchema
from app.helpers.authentication_functions import get_current_user_id
from app.helpers.study_status import sync_study_status

logger = logging.getLogger(__name__)
router = APIRouter()


def _study_to_dict(study: Study) -> StudySchema:
    return StudySchema.from_orm(study)


@router.get("/studies/{study_uid}", response_model=StudySchema)
def retrieve_study(
    study_uid: str,
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    """
    Retrieve a single study by UID for the authenticated user.

    Steps:
    1. Read the authenticated user's ID from the JWT token.
    2. Query the database for the Study row where `study_uid` and `user_id` match.
    3. Return the study serialized to the same shape as the list endpoint, or 404 if not found.
    """
    study = (
        db.query(Study)
        .filter(Study.study_uid == study_uid, Study.user_id == current_user_id)
        .first()
    )
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    _, changed = sync_study_status(study)
    if changed:
        db.commit()

    return _study_to_dict(study)
