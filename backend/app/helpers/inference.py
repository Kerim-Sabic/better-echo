import io
import math
import logging
from typing import List, Optional
import requests
from fastapi import APIRouter, HTTPException, Query
from PIL import Image
import numpy as np
import torch

from app.database.db import SessionLocal
from app.models.study import Study
from app.models.derived_result import DerivedResult

from app.core.config import settings
from app.schemas.infer_panecho_schemas import EFPanEchoResponse

"""
THIS FILE PROVIDES FUNCTIONS FOR INFERENCE TASKS
"""

logger = logging.getLogger(__name__)

orthanc_url = settings.ORTHANC_URL
orthanc_user = settings.ORTHANC_USER
orthanc_pass = settings.ORTHANC_PASS


def fetch_instance_ids_from_study(study_uid: str) -> List[str]:
    # Find Orthanc study by DICOM StudyInstanceUID, then list its instances
    # 1) Query studies by UID
    logger.info(f"[EF] Resolving Orthanc study for StudyInstanceUID={study_uid}")
    r = requests.get(f"{orthanc_url}/studies", auth=(orthanc_user, orthanc_pass))
    r.raise_for_status()
    studies = r.json()
    match = None
    for sid in studies:
        info = requests.get(f"{orthanc_url}/studies/{sid}", auth=(orthanc_user, orthanc_pass)).json()
        if info.get("MainDicomTags", {}).get("StudyInstanceUID") == study_uid:
            match = sid
            break
    if not match:
        logger.warning(f"[EF] No Orthanc study matches StudyInstanceUID={study_uid}")
        return []
    # 2) Get all instances in that study
    insts = requests.get(f"{orthanc_url}/studies/{match}/instances", auth=(orthanc_user, orthanc_pass)).json()
    ids = [i["ID"] for i in insts]
    logger.info(f"[EF] Found {len(ids)} instance(s) in the study")
    return ids

def pick_frames_from_instance(instance_id: str, num_frames: int = 16) -> List[Image.Image]:
    # Get instance metadata to know number of frames
    logger.info(f"[EF] Picking frames from instance {instance_id}")
    meta = requests.get(f"{orthanc_url}/instances/{instance_id}", auth=(orthanc_user, orthanc_pass)).json()
    frames = meta.get("Frames", 1)  # multi-frame cine or 1
    logger.info(f"[EF] Instance has {frames} frame(s)")
    # Pick 16 approximately evenly spaced frame indices (1-based in Orthanc HTTP)
    indices = [max(1, min(frames, 1 + math.floor(i * frames / num_frames))) for i in range(num_frames)]
    imgs: List[Image.Image] = []
    for idx in indices:
        # rendered PNG/JPEG of that frame
        # /instances/{id}/frames/{frame}/rendered  (Orthanc returns image bytes)
        resp = requests.get(f"{orthanc_url}/instances/{instance_id}/frames/{idx}/rendered",
                            auth=(orthanc_user, orthanc_pass))
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        img = img.resize((224, 224), Image.BILINEAR)
        imgs.append(img)
    logger.info(f"[EF] Collected {len(imgs)} frame(s)")
    return imgs

def stack_to_tensor(frames: List[Image.Image]) -> torch.Tensor:
    logger.info("[EF] Stacking frames into tensor and ImageNet-normalizing")
    # frames: list of PIL RGB 224x224; output: (1,3,T,224,224), normalized ImageNet
    arr = np.stack([np.asarray(f).astype(np.float32) / 255.0 for f in frames], axis=0)  # (T, H, W, C)
    # ImageNet mean/std
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)[None, None, None, :]
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)[None, None, None, :]
    arr = (arr - mean) / std
    arr = np.transpose(arr, (3, 0, 1, 2))  # (C, T, H, W)
    t = torch.from_numpy(arr).unsqueeze(0)  # (1, C, T, H, W)
    logger.info(f"[EF] Tensor shape: {tuple(t.shape)} dtype={t.dtype}")
    return t

# Lazy load the model once
_model = None
_device = None

def get_model_and_device():
    global _model, _device
    if _model is None:
        # pick device explicitly
        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"[EF] Loading PanEcho model on device: {_device}")
        try:
            # requires outbound network/git the first time unless cached locally
            _model = torch.hub.load(
                'CarDS-Yale/PanEcho',
                'PanEcho',
                force_reload=False
            )
            _model.to(_device).eval()
            logger.info("[EF] PanEcho model loaded successfully")
        except Exception as e:
            logger.error(f"[EF] Failed to load PanEcho via torch.hub: {e}")
            raise
    return _model, _device
