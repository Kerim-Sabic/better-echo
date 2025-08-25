import logging
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from api.upload import router as upload_router
from api.infer import router as infer_router
from api.studies import router as studies_router
from api.infer_all_panecho import router as infer_all_panecho_router
from api.infer_echoprime import router as infer_echoprime_router

from core.config import settings

os.makedirs("logs", exist_ok=True)

# Configure logging globally
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
    handlers=[
        logging.FileHandler("logs/horalix.log"),
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

# Routes
app.include_router(upload_router, prefix="/api", tags=["Upload dicom"])
app.include_router(infer_router,  prefix="/api", tags=["Inference"])
app.include_router(studies_router, prefix="/api", tags=["Studies"])
app.include_router(infer_all_panecho_router, prefix="/api", tags=["Inference"])
app.include_router(infer_echoprime_router, prefix="/api", tags=["Inference"])


if __name__ == "__main__":
    logger.info("Starting FastAPI server on 0.0.0.0:8000")
    uvicorn.run("main:app", host = "0.0.0.0", port=8000, reload=True)
