import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn

from app.api.health import router as health_router
from app.api.upload import router as upload_router
from app.api.studies import router as studies_router
from app.api.infer_panecho import router as infer_all_panecho_router
from app.api.infer_echoprime import router as infer_echoprime_router
from app.api.infer_echonet_dynamic import router as infer_echonet_dynamic_router
from app.api.infer_measurements import router as infer_measurements_router
from app.api.authentication import router as authentication_router
from app.api.llm import router as llm_router
from app.api.orchestration_apis.combined_panecho_echoprime import router as combined_panecho_echoprime
from app.api.orchestration_apis.combined_dynamic_measurements import router as combined_dynamic_measurements
from app.api.orchestration_apis.llm_report_get_api import router as llm_report_get_api
from app.api.get_patient_from_study_uid_api import router as get_patient_from_study_uid_api
from app.helpers.AVI_to_MP4_converter import kill_tracked_ffmpeg_processes

from app.core.config import settings

os.makedirs("app/logs", exist_ok=True)

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

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGIN,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # backend/app
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")         # backend/app/uploads

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Routes
app.include_router(health_router, prefix="/api", tags=["Health"])

app.include_router(upload_router, prefix="/api", tags=["Upload dicom"])

app.include_router(studies_router, prefix="/api", tags=["Studies"])

app.include_router(get_patient_from_study_uid_api, prefix="/api", tags=["Patients"])

app.include_router(infer_all_panecho_router, prefix="/api", tags=["Inference"])
app.include_router(infer_echoprime_router, prefix="/api", tags=["Inference"])
app.include_router(infer_echonet_dynamic_router, prefix="/api", tags=["Inference"])
app.include_router(infer_measurements_router, prefix="/api", tags=["Inference"])

app.include_router(authentication_router, prefix="/api", tags=["Authentication"])

app.include_router(llm_router, prefix="/api", tags=["LLM"])

app.include_router(combined_panecho_echoprime, prefix="/api", tags=["Orchestration APIs"])
app.include_router(combined_dynamic_measurements, prefix="/api", tags=["Orchestration APIs"])
app.include_router(llm_report_get_api, prefix="/api", tags=["Orchestration APIs"])


@app.on_event("shutdown")
def shutdown_cleanup():
    """
    Ensure auxiliary processes are stopped when the app exits.
    """
    try:
        kill_tracked_ffmpeg_processes()
        logger.info("Shutdown cleanup: terminated tracked ffmpeg processes.")
    except Exception as exc:
        logger.warning("Shutdown cleanup: failed to kill tracked ffmpeg processes: %s", exc)


if __name__ == "__main__":
    logger.info("Starting FastAPI server on 0.0.0.0:8000")
    uvicorn.run("app.main:app", host = "0.0.0.0", port=8000, reload=True)
