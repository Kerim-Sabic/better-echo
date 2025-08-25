import io
import math
import os
import traceback
import logging
from typing import List, Optional
import requests
from fastapi import APIRouter, HTTPException, Query
from PIL import Image
import numpy as np
import torch

from db import SessionLocal
from models.study import Study
from models.derived_result import DerivedResult

from core.config import settings
from schemas.inference_schemas import EFResponse

logger = logging.getLogger(__name__)

orthanc_url = settings.ORTHANC_URL
orthanc_user = settings.ORTHANC_USER
orthanc_pass = settings.ORTHANC_PASS

router = APIRouter()

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
                force_reload=False,
                tasks=['EF']
            )
            _model.to(_device).eval()
            logger.info("[EF] PanEcho model loaded successfully")
        except Exception as e:
            logger.error(f"[EF] Failed to load PanEcho via torch.hub: {e}")
            raise
    return _model, _device

@router.get("/infer/ef", response_model=EFResponse)
def infer_ef(instance_id: Optional[str] = Query(None), study_uid: Optional[str] = Query(None)):
    logger.info(f"[EF] infer_ef called with instance_id={instance_id} study_uid={study_uid}")
    if not instance_id and not study_uid:
        raise HTTPException(status_code=400, detail="Provide instance_id or study_uid")

    ids: List[str] = []
    if study_uid:
        ids = fetch_instance_ids_from_study(study_uid)
        if not ids:
            raise HTTPException(status_code=404, detail=f"No instances for study_uid={study_uid}")
        # crude: just use the first cine instance
        instance_id = ids[0] # TODO: consider aggregating across all cine instances
        logger.info(f"[EF] Using instance_id={instance_id} from study")

    try:
        frames = pick_frames_from_instance(instance_id, 16)
        x = stack_to_tensor(frames)
        model, device = get_model_and_device()
        logger.info(f"[EF] Running inference on device={device} with input dtype={x.dtype}")
        with torch.no_grad():
            preds = model(x.to(device))  # (1, 1) for EF
        # PanEcho returns dict of tasks; EF as a regression scalar
        ef = preds.get('EF') if isinstance(preds, dict) else None
        if ef is None:
            raise RuntimeError("Model returned no 'EF' key")
        if torch.is_tensor(ef):
            ef = ef.detach().cpu().flatten().tolist()[0] if ef.numel() > 0 else None
        elif isinstance(ef, (list, tuple)) and len(ef) > 0:
            ef = float(ef[0])
        else:
            ef = float(ef)

        logger.info(f"[EF] EF prediction: {ef}")

        db = SessionLocal()
        try:
            q = db.query(Study)
            if instance_id:
                q = q.filter(Study.instance_id == instance_id)
            elif study_uid:
                q = q.filter(Study.study_uid == study_uid)
            study = q.first()
            if study:
                # Optional cached EF on the study row (add this column, see Section 3)
                if hasattr(study, "ef_value"):
                    study.ef_value = float(ef)
                # Flip status to 'ready' if the column exists (see Section 3)
                if hasattr(study, "status"):
                    study.status = "ready"
                # Record a derived result row (see model in Section 3)
                dr = DerivedResult(
                    study_id=study.id,
                    type="EF",
                    value_numeric=float(ef),
                    units="%",
                    model_name="PanEcho",
                    model_version="v1"
                )
                db.add(dr)
                db.commit()
        finally:
            db.close()
        
        return {"instance_id": instance_id, "ef": ef}
    
    except Exception as e:
        logger.exception(f"[EF] EF inference failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"EF inference failed: {type(e).__name__}: {e}")

