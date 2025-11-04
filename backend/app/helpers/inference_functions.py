import io
import os
import math
import logging
from typing import List
import requests
from PIL import Image
import numpy as np
import torch
from pathlib import Path

from app.core.config import settings

"""
THIS FILE PROVIDES FUNCTIONS FOR INFERENCE TASKS
"""

logger = logging.getLogger(__name__)

orthanc_url = settings.ORTHANC_URL
orthanc_user = settings.ORTHANC_USER
orthanc_pass = settings.ORTHANC_PASS

   
def check_instance_exists_in_orthanc(sop_instance_uid: str) -> bool:
    """
    Check if a DICOM instance (SOPInstanceUID) exists in Orthanc.
    Returns True if found, False otherwise.
    """
    try:
        logger.info(f"[INFERENCE_FUNCTIONS] Checking if instance exists in Orthanc: SOPInstanceUID={sop_instance_uid}")
        
        # Query all instances
        r = requests.get(f"{orthanc_url}/instances", auth=(orthanc_user, orthanc_pass))
        r.raise_for_status()
        instances = r.json()  # list of instance Orthanc IDs

        # Look for a matching SOPInstanceUID
        for iid in instances:
            r_info = requests.get(f"{orthanc_url}/instances/{iid}", auth=(orthanc_user, orthanc_pass))
            r_info.raise_for_status()
            info = r_info.json()
            if info.get("MainDicomTags", {}).get("SOPInstanceUID") == sop_instance_uid:
                logger.info(f"[INFERENCE_FUNCTIONS] Instance {sop_instance_uid} exists in Orthanc.")
                return True

        logger.warning(f"[INFERENCE_FUNCTIONS] Instance {sop_instance_uid} not found in Orthanc.")
        return False

    except requests.RequestException as e:
        logger.error(f"[INFERENCE_FUNCTIONS] Error checking instance in Orthanc: {e}")
        return False


def fetch_orthanc_instance_ids_from_study(study_uid: str) -> List[str]:
    # Find Orthanc study by DICOM StudyInstanceUID, then list its instances
    # 1) Query studies by UID
    logger.info(f"[INFERENCE_FUNCTIONS] Resolving Orthanc study for StudyInstanceUID={study_uid}")
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
        logger.warning(f"[INFERENCE_FUNCTIONS] No Orthanc study matches StudyInstanceUID={study_uid}")
        return []
    
    # 2) Get all instances in that study
    insts = requests.get(f"{orthanc_url}/studies/{match}/instances", auth=(orthanc_user, orthanc_pass)).json()
    ids = [i["ID"] for i in insts]
    logger.info(f"[INFERENCE_FUNCTIONS] Found {len(ids)} instance(s) in the study")
    return ids

def pick_frames_from_instance(instance_id: str, num_frames: int = 16) -> List[Image.Image]:
    # Get instance metadata to know number of frames
    logger.info(f"[INFERENCE_FUNCTIONS] Picking frames from instance {instance_id}")
    meta = requests.get(f"{orthanc_url}/instances/{instance_id}", auth=(orthanc_user, orthanc_pass)).json()
    frames_list = requests.get(f"{orthanc_url}/instances/{instance_id}/frames",
                               auth=(orthanc_user, orthanc_pass), timeout=10).json()
    frames = len(frames_list) if isinstance(frames_list, list) else int(meta.get("MainDicomTags", {}).get("NumberOfFrames", 1))
    logger.info(f"[INFERENCE_FUNCTIONS] Instance has {frames} frame(s)")
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
    logger.info(f"[INFERENCE_FUNCTIONS] Collected {len(imgs)} frame(s)")
    return imgs

def stack_to_tensor(frames: List[Image.Image]) -> torch.Tensor:
    logger.info("[INFERENCE_FUNCTIONS] Stacking frames into tensor and ImageNet-normalizing")
    # frames: list of PIL RGB 224x224; output: (1,3,T,224,224), normalized ImageNet
    arr = np.stack([np.asarray(f).astype(np.float32) / 255.0 for f in frames], axis=0)  # (T, H, W, C)
    # ImageNet mean/std
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)[None, None, None, :]
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)[None, None, None, :]
    arr = (arr - mean) / std
    arr = np.transpose(arr, (3, 0, 1, 2))  # (C, T, H, W)
    t = torch.from_numpy(arr).unsqueeze(0)  # (1, C, T, H, W)
    logger.info(f"[INFERENCE_FUNCTIONS] Tensor shape: {tuple(t.shape)} dtype={t.dtype}")
    return t

# Lazy load the model once
_model = None
_device = None

def get_model_and_device():
    global _model, _device
    if _model is None:
        # pick device explicitly
        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"[INFERENCE_FUNCTIONS] Loading PanEcho model on device: {_device}")
        
        # Local PanEcho repo path (vendored)
        local_repo_dir = (Path(__file__).resolve().parent.parent / "AI_models" / "PanEcho").resolve()
        hubconf_path = local_repo_dir / "hubconf.py"
        if not hubconf_path.exists():
            raise RuntimeError(
                f"PanEcho local repo is missing at {local_repo_dir}."
                f"Expected hubconf.py at {hubconf_path}. Please vendor the repo and assets."
            )
        
        # Ensure a local torch hub cache (keeps artifacts in-repo; no network)
        torch_cache_dir = (local_repo_dir / "pytorch_hub_cache").resolve()
        os.environ.setdefault("TORCH_HOME", str(torch_cache_dir))
        try:
            torch_cache_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.warning(f"[INFERENCE_FUNCTIONS] Could not create TORCH_HOME at {torch_cache_dir}: {e}")
        
        # Strictly load from local repo (offline)
        _model = torch.hub.load(
            str(local_repo_dir),
            'PanEcho',
            source='local',
            force_reload=False
        )
        _model.to(_device).eval()
        logger.info("[INFERENCE_FUNCTIONS] PanEcho (local) loaded successfully")

    return _model, _device
