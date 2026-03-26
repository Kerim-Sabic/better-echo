from fastapi import APIRouter

from .licensing_api import router as licensing_router

router = APIRouter()
router.include_router(licensing_router)
