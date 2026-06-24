from fastapi import APIRouter

from .combined_dynamic_measurements_api import router as combined_dynamic_measurements_router
from .combined_study_analysis_api import router as combined_study_analysis_router
from .llm_report_get_api import router as llm_report_get_router
from .overlays_api import router as overlays_router

router = APIRouter()

router.include_router(combined_study_analysis_router)
router.include_router(combined_dynamic_measurements_router)
router.include_router(llm_report_get_router)
router.include_router(overlays_router)
