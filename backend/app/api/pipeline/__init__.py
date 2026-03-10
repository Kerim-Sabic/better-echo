from fastapi import APIRouter

from .pipeline_cancel_api import router as pipeline_cancel_router
from .pipeline_promote_api import router as pipeline_promote_router
from .pipeline_regenerate_api import router as pipeline_regenerate_router
from .pipeline_start_api import router as pipeline_start_router
from .pipeline_status_api import router as pipeline_status_router

router = APIRouter()

router.include_router(pipeline_start_router)
router.include_router(pipeline_status_router)
router.include_router(pipeline_promote_router)
router.include_router(pipeline_cancel_router)
router.include_router(pipeline_regenerate_router)
