import logging
import os
import warnings

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from app.api.health.health_api import router as health_router
from app.api.inference.infer_echoprime_api import start_echoprime_preload_background, unload_ep
from app.api.upload_dicom import router as upload_dicom_router
from app.api.studies import router as studies_router
from app.api.patients import router as patients_router
from app.api.inference import router as inference_router
from app.api.authentication import router as authentication_router
from app.api.llm import router as llm_router
from app.api.orchestration_apis import router as orchestration_router
from app.helpers.media.ffmpeg_mp4_writer import kill_tracked_ffmpeg_processes
from app.helpers.inference_runtime.device_selector import get_device_for_model
from app.helpers.inference_runtime.preload_utils import safe_preload, has_min_vram
from app.services.auth.webauthn.state import assert_webauthn_state_runtime_safe
from app.services.pipeline.scheduler import start_pipeline_scheduler, stop_pipeline_scheduler

from app.core.config import settings
from app.core.artifacts import UPLOAD_DIR

os.makedirs("app/logs", exist_ok=True)

# Suppress noisy bcrypt version probe from passlib (harmless)
warnings.filterwarnings(
    "ignore",
    message=".*error reading bcrypt version.*",
    module="passlib.handlers.bcrypt",
)

# Configure logging globally
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
    handlers=[
        logging.FileHandler("app/logs/horalix.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)
# Silence passlib bcrypt version probe warnings (harmless)
logging.getLogger("passlib.handlers.bcrypt").setLevel(logging.ERROR)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGIN,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Routes
app.include_router(health_router, prefix="/api", tags=["Health"])
app.include_router(authentication_router, prefix="/api")
app.include_router(upload_dicom_router, prefix="/api", tags=["Upload dicom"])
app.include_router(studies_router, prefix="/api", tags=["Studies"])
app.include_router(patients_router, prefix="/api", tags=["Patients"])
app.include_router(inference_router, prefix="/api", tags=["Inference"])
app.include_router(llm_router, prefix="/api", tags=["LLM"])
app.include_router(orchestration_router, prefix="/api", tags=["Orchestration APIs"])

@app.on_event("startup")
def startup_preload_models():
    """
    Sequential, guarded preloads based on env flags.
    Each stage checks VRAM and skips on low memory or errors.
    """
    # Part 1. Validate WebAuthn state runtime mode.
    assert_webauthn_state_runtime_safe(
        state_backend=settings.WEBAUTHN_STATE_BACKEND,
        require_single_process=settings.WEBAUTHN_REQUIRE_SINGLE_PROCESS,
    )

    # Part 2. Start backend-owned pipeline scheduler loop.
    start_pipeline_scheduler()

    def _preload_panecho():
        from app.helpers.inference_runtime.inference_functions import get_model_and_device
        get_model_and_device()

    def _preload_echonet():
        from app.api.inference.infer_echonet_dynamic_api import load_model
        load_model()

    def _preload_measurements():
        from app.AI_models.measurements.runner_2d import _load_model, VALID_2D_WEIGHTS
        for w in VALID_2D_WEIGHTS:
            _load_model(w)

    # PanEcho
    if settings.PANECHO_PRELOAD:
        device = get_device_for_model("panecho", log_device=False)
        safe_preload("PanEcho", device, required_gb=2.0, loader=_preload_panecho)

    # EchoPrime
    if settings.ECHOPRIME_PRELOAD:
        device = get_device_for_model("echoprime", log_device=False)
        if has_min_vram(device, required_gb=6.0):
            try:
                start_echoprime_preload_background(settings.ECHOPRIME_WARMUP)
                logger.info("Startup preload: EchoPrime loading in background (warmup=%s)", settings.ECHOPRIME_WARMUP)
            except Exception as exc:
                logger.warning("Startup preload: EchoPrime preload thread failed to start; will lazy-load on demand: %s", exc)
        else:
            logger.warning("Startup preload: Skipping EchoPrime preload due to low VRAM on %s", device)

    # EchoNet-Dynamic
    if settings.ECHONET_PRELOAD:
        device = get_device_for_model("echonet", log_device=False)
        safe_preload("EchoNet-Dynamic", device, required_gb=2.0, loader=_preload_echonet)

    # Measurements 2D
    if settings.MEASUREMENTS_PRELOAD:
        device = get_device_for_model("measurements", log_device=False)
        safe_preload("Measurements2D", device, required_gb=2.0, loader=_preload_measurements)

@app.on_event("shutdown")
def shutdown_cleanup():
    """
    Ensure auxiliary processes are stopped when the app exits.
    """
    try:
        stop_pipeline_scheduler()
        logger.info("Shutdown cleanup: pipeline scheduler stopped.")
    except Exception as exc:
        logger.warning("Shutdown cleanup: failed to stop pipeline scheduler: %s", exc)
    try:
        kill_tracked_ffmpeg_processes()
        logger.info("Shutdown cleanup: terminated tracked ffmpeg processes.")
    except Exception as exc:
        logger.warning("Shutdown cleanup: failed to kill tracked ffmpeg processes: %s", exc)
    try:
        unload_ep()
        logger.info("Shutdown cleanup: unloaded EchoPrime.")
    except Exception as exc:
        logger.warning("Shutdown cleanup: failed to unload EchoPrime: %s", exc)

if __name__ == "__main__":
    logger.info("Starting FastAPI server on 0.0.0.0:8000")
    uvicorn.run("app.main:app", host = "0.0.0.0", port=8000, reload=True)

