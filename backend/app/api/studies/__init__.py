from fastapi import APIRouter

from .list_studies_api import router as list_studies_router
from .retrieve_study_api import router as retrieve_study_router
from .delete_study_api import router as delete_study_router
from .update_study_api import router as update_study_router
from .list_instances_api import router as list_instances_router

router = APIRouter()

router.include_router(list_studies_router)
router.include_router(retrieve_study_router)
router.include_router(delete_study_router)
router.include_router(update_study_router)
router.include_router(list_instances_router)
