from fastapi import APIRouter

from .infer_panecho_api import router as infer_panecho_router
from .infer_echoprime_api import router as infer_echoprime_router
from .infer_echonet_dynamic_api import router as infer_echonet_dynamic_router
from .infer_measurements_api import router as infer_measurements_router
from .infer_doppler_api import router as infer_doppler_router

router = APIRouter()

router.include_router(infer_panecho_router)
router.include_router(infer_echoprime_router)
router.include_router(infer_echonet_dynamic_router)
router.include_router(infer_measurements_router)
router.include_router(infer_doppler_router)
