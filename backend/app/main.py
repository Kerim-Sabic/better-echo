import logging
import os
import socket
import warnings

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from app.api.health.health_api import router as health_router
from app.api.admin import router as admin_router
from app.services.inference.secondary_analysis_service import (
    start_secondary_analysis_preload_background,
    unload_secondary_analysis_model,
)
from app.api.upload_dicom import router as upload_dicom_router
from app.api.studies import router as studies_router
from app.api.patients import router as patients_router
from app.api.inference import router as inference_router
from app.api.authentication import router as authentication_router
from app.api.licensing import router as licensing_router
from app.api.llm import router as llm_router
from app.api.pipeline import router as pipeline_router
from app.api.results import router as results_router
from app.database.setup_db import init_db
from app.helpers.media.ffmpeg_mp4_writer import kill_tracked_ffmpeg_processes
from app.helpers.inference_runtime.device_selector import get_device_for_model
from app.helpers.inference_runtime.inference_functions import unload_primary_analysis_model
from app.helpers.inference_runtime.preload_utils import safe_preload, has_min_vram
from app.services.licensing.middleware import enforce_license_middleware
from app.services.licensing.service import log_current_license_status
from app.services.release import run_release_identifier_migration
from app.services.auth.webauthn.state import assert_webauthn_state_runtime_safe
from app.services.pipeline.scheduler import start_pipeline_scheduler, stop_pipeline_scheduler

from app.core.config import settings
from app.core.artifacts import UPLOAD_DIR
from app.core.runtime_paths import logs_dir
from app.vendor_access.router import router as vendor_access_router

LOGS_DIR = logs_dir()
LOG_FILE = LOGS_DIR / "horalix.log"

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
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)
# Silence passlib bcrypt version probe warnings (harmless)
logging.getLogger("passlib.handlers.bcrypt").setLevel(logging.ERROR)
# Part 1. Keep terminal output readable by suppressing high-volume HTTP access poll logs.
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


# Part 2. Detect current LAN IPv4 to support same-network frontend testing.
def _detect_lan_ipv4() -> str | None:
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        return None
    finally:
        if sock:
            sock.close()
    return None


# Part 3. Build CORS allowlist from env + detected LAN frontend origin.
_detected_lan_ip = _detect_lan_ipv4()
_cors_origins = list(settings.CORS_ORIGIN)
if _detected_lan_ip:
    _lan_frontend_origin = f"http://{_detected_lan_ip}:3000"
    if _lan_frontend_origin not in _cors_origins:
        _cors_origins.append(_lan_frontend_origin)

release_mode = os.environ.get("HORALIX_RELEASE_MODE") == "1"

app = FastAPI(
    docs_url=None if release_mode else "/docs",
    redoc_url=None if release_mode else "/redoc",
    openapi_url=None if release_mode else "/openapi.json",
)
app.middleware("http")(enforce_license_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Routes
app.include_router(health_router, prefix="/api", tags=["Health"])
app.include_router(admin_router, prefix="/api", tags=["Admin"])
app.include_router(licensing_router, prefix="/api", tags=["Licensing"])
app.include_router(authentication_router, prefix="/api")
if release_mode and settings.VENDOR_ACCESS_ENABLED:
    app.include_router(vendor_access_router, prefix="/api", tags=["Vendor Access"])
app.include_router(upload_dicom_router, prefix="/api", tags=["Upload dicom"])
app.include_router(studies_router, prefix="/api", tags=["Studies"])
app.include_router(patients_router, prefix="/api", tags=["Patients"])
app.include_router(inference_router, prefix="/api", tags=["Inference"])
app.include_router(llm_router, prefix="/api", tags=["LLM"])
app.include_router(results_router, prefix="/api", tags=["AI Results"])
app.include_router(pipeline_router, prefix="/api", tags=["Pipeline"])

@app.on_event("startup")
def startup_preload_models():
    """
    Sequential, guarded preloads based on env flags.
    Each stage checks VRAM and skips on low memory or errors.
    """
    # Part 0. Ensure schema exists before the scheduler touches queue tables.
    init_db()

    # Part 0.05. Normalize legacy persisted identifiers once for packaged release builds.
    if release_mode:
        try:
            run_release_identifier_migration()
        except Exception as exc:
            logger.exception("Release identifier migration failed; aborting packaged startup.")
            raise RuntimeError("Release identifier migration failed") from exc

    # Part 0.1 Load and log license status once at startup so runtime gating stays lightweight.
    log_current_license_status()

    # Part 1. Validate WebAuthn state runtime mode.
    assert_webauthn_state_runtime_safe(
        state_backend=settings.WEBAUTHN_STATE_BACKEND,
        require_single_process=settings.WEBAUTHN_REQUIRE_SINGLE_PROCESS,
    )

    # Part 2. Start backend-owned pipeline scheduler loop.
    start_pipeline_scheduler()

    # Part 2.1 Emit LAN access hints for manual device testing.
    if _detected_lan_ip:
        logger.info("LAN frontend URL hint: http://%s:3000", _detected_lan_ip)
        logger.info("LAN backend URL hint:  http://%s:8000", _detected_lan_ip)
    logger.info("CORS allow origins: %s", _cors_origins)

    def _preload_primary_analysis():
        from app.helpers.inference_runtime.inference_functions import get_model_and_device
        get_model_and_device()

    def _preload_motion_segmentation():
        from app.services.inference.motion_segmentation_service import (
            load_motion_segmentation_model,
        )
        load_motion_segmentation_model()

    def _preload_measurements():
        from app.AI_models.measurements.runner_2d import _load_model, VALID_2D_WEIGHTS
        for w in VALID_2D_WEIGHTS:
            _load_model(w)

    # Primary analysis
    if settings.PRIMARY_ANALYSIS_PRELOAD:
        device = get_device_for_model("primary_analysis", log_device=False)
        safe_preload("PrimaryAnalysis", device, required_gb=2.0, loader=_preload_primary_analysis)

    # Secondary analysis
    if settings.SECONDARY_ANALYSIS_PRELOAD:
        device = get_device_for_model("secondary_analysis", log_device=False)
        if has_min_vram(device, required_gb=6.0):
            try:
                start_secondary_analysis_preload_background(settings.SECONDARY_ANALYSIS_WARMUP)
                logger.info("Startup preload: secondary analysis loading in background (warmup=%s)", settings.SECONDARY_ANALYSIS_WARMUP)
            except Exception as exc:
                logger.warning("Startup preload: secondary analysis preload thread failed to start; will lazy-load on demand: %s", exc)
        else:
            logger.warning("Startup preload: skipping secondary analysis preload due to low VRAM on %s", device)

    # Motion segmentation
    if settings.MOTION_SEGMENTATION_PRELOAD:
        device = get_device_for_model("motion_segmentation", log_device=False)
        safe_preload("MotionSegmentation", device, required_gb=2.0, loader=_preload_motion_segmentation)

    # Study measurements
    if settings.STUDY_MEASUREMENTS_PRELOAD:
        device = get_device_for_model("study_measurements", log_device=False)
        safe_preload("StudyMeasurements", device, required_gb=2.0, loader=_preload_measurements)

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
        unload_secondary_analysis_model()
        logger.info("Shutdown cleanup: unloaded secondary analysis.")
    except Exception as exc:
        logger.warning("Shutdown cleanup: failed to unload secondary analysis: %s", exc)
    try:
        unload_primary_analysis_model()
        logger.info("Shutdown cleanup: unloaded primary analysis.")
    except Exception as exc:
        logger.warning("Shutdown cleanup: failed to unload primary analysis: %s", exc)
    try:
        from app.AI_models.measurements.runner_2d import unload_2d_models
        from app.AI_models.measurements.runner_doppler import unload_doppler_models

        unload_2d_models()
        unload_doppler_models()
        logger.info("Shutdown cleanup: unloaded Measurements models.")
    except Exception as exc:
        logger.warning("Shutdown cleanup: failed to unload Measurements models: %s", exc)

if __name__ == "__main__":
    logger.info("Starting FastAPI server on 0.0.0.0:8000")
    uvicorn.run("app.main:app", host = "0.0.0.0", port=8000, reload=True)

