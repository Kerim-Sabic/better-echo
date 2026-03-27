import logging
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import pydicom

from app.database.db import get_db
from app.database_models.studies import Study
from app.schemas.studies.studies_schemas import StudyDetailsSchema
from app.helpers.auth.authentication_functions import get_current_user_id
from app.helpers.pipeline.study_status import (
    compute_study_status,
    is_llm_enabled,
    status_by_type,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _safe_tag_string(value) -> str | None:
    if value is None:
        return None

    normalized = str(value).strip()
    return normalized or None


def _extract_study_details_metadata(study: Study) -> dict:
    metadata = {
        "study_time": None,
        "accession_number": None,
        "referring_physician_name": None,
        "sonographer_name": None,
        "indication": study.description or None,
        "machine_name": None,
        "modality": None,
    }

    first_series = next(iter(study.series or []), None)
    if first_series and first_series.modality:
        metadata["modality"] = first_series.modality

    first_instance = None
    for series in study.series or []:
        for instance in series.instances or []:
            if instance.file_path and os.path.exists(instance.file_path):
                first_instance = instance
                if not metadata["modality"] and series.modality:
                    metadata["modality"] = series.modality
                break
        if first_instance:
            break

    if not first_instance:
        return metadata

    try:
        ds = pydicom.dcmread(first_instance.file_path, stop_before_pixels=True, force=True)
    except Exception as exc:  # pragma: no cover - best effort metadata enrichment
        logger.warning(
            "[retrieve_study] Failed to read DICOM tags for study_uid=%s from %s: %s",
            study.study_uid,
            first_instance.file_path,
            exc,
        )
        return metadata

    metadata["study_time"] = _safe_tag_string(getattr(ds, "StudyTime", None))
    metadata["accession_number"] = _safe_tag_string(getattr(ds, "AccessionNumber", None))
    metadata["referring_physician_name"] = _safe_tag_string(
        getattr(ds, "ReferringPhysicianName", None)
    )
    metadata["sonographer_name"] = _safe_tag_string(getattr(ds, "OperatorsName", None))
    metadata["indication"] = (
        _safe_tag_string(getattr(ds, "RequestedProcedureDescription", None))
        or _safe_tag_string(getattr(ds, "ReasonForStudy", None))
        or metadata["indication"]
    )
    metadata["machine_name"] = (
        _safe_tag_string(getattr(ds, "ManufacturerModelName", None))
        or _safe_tag_string(getattr(ds, "Manufacturer", None))
    )
    metadata["modality"] = metadata["modality"] or _safe_tag_string(getattr(ds, "Modality", None))

    return metadata


def _study_to_dict(study: Study, *, status: str | None = None) -> StudyDetailsSchema:
    metadata = _extract_study_details_metadata(study)

    return StudyDetailsSchema.model_validate(
        {
            "id": study.id,
            "study_uid": study.study_uid,
            "study_date": study.study_date,
            "description": study.description,
            "status": status if status is not None else study.status,
            "uploaded_at": study.uploaded_at,
            "patient_height_cm": study.patient_height_cm,
            "patient_weight_kg": study.patient_weight_kg,
            "heart_rate_bpm": study.heart_rate_bpm,
            "patient": {
                "id": study.patient.id,
                "patient_id": study.patient.patient_id,
                "patient_name": study.patient.patient_name,
                "patient_sex": study.patient.patient_sex,
                "patient_birth_date": study.patient.patient_birth_date,
            },
            "diagnoses": None,
            "study_time": metadata["study_time"],
            "accession_number": metadata["accession_number"],
            "referring_physician_name": metadata["referring_physician_name"],
            "sonographer_name": metadata["sonographer_name"],
            "indication": metadata["indication"],
            "machine_name": metadata["machine_name"],
            "modality": metadata["modality"],
        }
    )


@router.get("/studies/{study_uid}", response_model=StudyDetailsSchema)
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

    llm_enabled = is_llm_enabled()
    derived_statuses = status_by_type(study.derived_results or [])
    effective_status = compute_study_status(llm_enabled, derived_statuses)

    return _study_to_dict(study, status=effective_status)

