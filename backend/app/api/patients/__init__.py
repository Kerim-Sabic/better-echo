from fastapi import APIRouter

from .get_patient_by_study_uid_api import router as get_patient_by_study_uid_router

router = APIRouter()

router.include_router(get_patient_by_study_uid_router)