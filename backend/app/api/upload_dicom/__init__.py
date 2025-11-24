from fastapi import APIRouter

from .upload_dicom_api import router as upload_dicom_router

router = APIRouter()

router.include_router(upload_dicom_router)