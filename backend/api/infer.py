# backend/api/infer.py
import io
import math
import os
from typing import List, Optional
import requests
from fastapi import APIRouter, HTTPException, Query
from PIL import Image
import numpy as np
import torch

ORTHANC_URL = os.getenv("ORTHANC_URL", "http://localhost:8042")
ORTHANC_USER = os.getenv("ORTHANC_USER", "orthanc")
ORTHANC_PASS = os.getenv("ORTHANC_PASS", "orthanc")

router = APIRouter()

def fetch_instance_ids_from_study(study_uid: str) -> List[str]:
    # Find Orthanc study by DICOM StudyInstanceUID, then list its instances
    # 1) Query studies by UID
    r = requests.get(f"{ORTHANC_URL}/studies", auth=(ORTHANC_USER, ORTHANC_PASS))
    r.raise_for_status()
    studies = r.json()
    match = None
    for sid in studies:
        info = requests.get(f"{ORTHANC_URL}/studies/{sid}", auth=(ORTHANC_USER, ORTHANC_PASS)).json()
        if info.get("MainDicomTags", {}).get("StudyInstanceUID") == study_uid:
            match = sid
            break
    if not match:
        return []
    # 2) Get all instances in that study
    insts = requests.get(f"{ORTHANC_URL}/studies/{match}/instances", auth=(ORTHANC_USER, ORTHANC_PASS)).json()
    return [i["ID"] for i in insts]

def pick_frames_from_instance(instance_id: str, num_frames: int = 16) -> List[Image.Image]:
    # Get instance metadata to know number of frames
    meta = requests.get(f"{ORTHANC_URL}/instances/{instance_id}", auth=(ORTHANC_USER, ORTHANC_PASS)).json()
    frames = meta.get("Frames", 1)  # multi-frame cine or 1
    # Pick 16 approximately evenly spaced frame indices (1-based in Orthanc HTTP)
    indices = [max(1, min(frames, 1 + math.floor(i * frames / num_frames))) for i in range(num_frames)]
    imgs: List[Image.Image] = []
    for idx in indices:
        # rendered PNG/JPEG of that frame
        # /instances/{id}/frames/{frame}/rendered  (Orthanc returns image bytes)
        resp = requests.get(f"{ORTHANC_URL}/instances/{instance_id}/frames/{idx}/rendered",
                            auth=(ORTHANC_USER, ORTHANC_PASS))
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        img = img.resize((224, 224), Image.BILINEAR)
        imgs.append(img)
    return imgs

def stack_to_tensor(frames: List[Image.Image]) -> torch.Tensor:
    # frames: list of PIL RGB 224x224; output: (1,3,T,224,224), normalized ImageNet
    arr = np.stack([np.asarray(f).astype(np.float32) / 255.0 for f in frames], axis=0)  # (T, H, W, C)
    # ImageNet mean/std
    mean = np.array([0.485, 0.456, 0.406])[None, None, None, :]
    std  = np.array([0.229, 0.224, 0.225])[None, None, None, :]
    arr = (arr - mean) / std
    arr = np.transpose(arr, (3, 0, 1, 2))  # (C, T, H, W)
    t = torch.from_numpy(arr).unsqueeze(0)  # (1, C, T, H, W)
    return t

# Lazy load the model once
_model = None
def get_model():
    global _model
    if _model is None:
        # only EF task head
        _model = torch.hub.load('CarDS-Yale/PanEcho', 'PanEcho', force_reload=False, tasks=['EF'])
        _model.eval()
    return _model

@router.get("/infer/ef")
def infer_ef(instance_id: Optional[str] = Query(None), study_uid: Optional[str] = Query(None)):
    if not instance_id and not study_uid:
        raise HTTPException(status_code=400, detail="Provide instance_id or study_uid")

    ids: List[str] = []
    if study_uid:
        ids = fetch_instance_ids_from_study(study_uid)
        if not ids:
            raise HTTPException(status_code=404, detail=f"No instances for study_uid={study_uid}")
        # crude: just use the first cine instance
        instance_id = ids[0]

    try:
        frames = pick_frames_from_instance(instance_id, 16)
        x = stack_to_tensor(frames)
        with torch.no_grad():
            preds = get_model()(x)
        # PanEcho returns dict of tasks; EF as a regression scalar
        ef = preds.get('EF', None)
        if isinstance(ef, (list, tuple)) and len(ef) > 0:
            ef = float(ef[0])
        elif torch.is_tensor(ef):
            ef = float(ef.item())
        return {"instance_id": instance_id, "ef": ef}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"EF inference failed: {e}")
