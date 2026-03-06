import io
import os
import math
import logging
import time
import gc
from typing import List, Tuple
import requests
from PIL import Image
import numpy as np
import torch
import pydicom
from pathlib import Path

from app.core.config import settings
from app.helpers.inference_runtime.device_selector import get_device_for_model

logger = logging.getLogger(__name__)

orthanc_url = settings.ORTHANC_URL
orthanc_user = settings.ORTHANC_USER
orthanc_pass = settings.ORTHANC_PASS

   
def check_instance_exists_in_orthanc(sop_instance_uid: str) -> bool:
    """
    Check if a DICOM instance (SOPInstanceUID) exists in Orthanc.
    Returns True if found, False otherwise.

    Note: performs an O(N) scan of Orthanc instances and is tuned for
    smaller deployments; large archives may want a query-based approach.
    """
    try:
        logger.info(f"[INFERENCE_FUNCTIONS] Checking if instance exists in Orthanc: SOPInstanceUID={sop_instance_uid}")
        
        # Query all instances (O(N) scan over Orthanc instances)
        r = requests.get(
            f"{orthanc_url}/instances",
            auth=(orthanc_user, orthanc_pass),
            timeout=10,
        )
        r.raise_for_status()
        instances = r.json()  # list of instance Orthanc IDs

        # Look for a matching SOPInstanceUID
        for iid in instances:
            r_info = requests.get(
                f"{orthanc_url}/instances/{iid}",
                auth=(orthanc_user, orthanc_pass),
                timeout=10,
            )
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
    """
    Resolve an Orthanc study by StudyInstanceUID and return a list of its instance IDs.
    """
    # Find Orthanc study by DICOM StudyInstanceUID, then list its instances
    logger.info(f"[INFERENCE_FUNCTIONS] Resolving Orthanc study for StudyInstanceUID={study_uid}")
    r = requests.get(
        f"{orthanc_url}/studies",
        auth=(orthanc_user, orthanc_pass),
        timeout=10,
    )
    r.raise_for_status()
    studies = r.json()
    match = None
    for sid in studies:
        info = requests.get(
            f"{orthanc_url}/studies/{sid}",
            auth=(orthanc_user, orthanc_pass),
            timeout=10,
        ).json()
        if info.get("MainDicomTags", {}).get("StudyInstanceUID") == study_uid:
            match = sid
            break
    if not match:
        logger.warning(f"[INFERENCE_FUNCTIONS] No Orthanc study matches StudyInstanceUID={study_uid}")
        return []
    
    # Get all instances in that study
    insts = requests.get(
        f"{orthanc_url}/studies/{match}/instances",
        auth=(orthanc_user, orthanc_pass),
        timeout=10,
    ).json()
    ids = [i["ID"] for i in insts]
    logger.info(f"[INFERENCE_FUNCTIONS] Found {len(ids)} instance(s) in the study")
    return ids


# Part 1. Normalize a DICOM frame into uint8 for PanEcho frame sampling.
def _normalize_frame_to_uint8(frame: np.ndarray) -> np.ndarray:
    if frame.ndim == 3:
        frame = frame[..., 0]
    data = frame.astype(np.float32)
    min_value = float(np.min(data))
    max_value = float(np.max(data))
    if max_value > min_value:
        data = (data - min_value) / (max_value - min_value) * 255.0
    else:
        data = np.zeros_like(data)
    return data.astype(np.uint8)


# Part 2. Fast local DICOM frame sampler for PanEcho.
def pick_frames_from_local_dicom(dicom_path: str, num_frames: int = 16) -> List[Image.Image]:
    if num_frames <= 0:
        raise ValueError("num_frames must be >= 1")

    ds = pydicom.dcmread(dicom_path, force=True)
    pixels = ds.pixel_array

    if pixels.ndim == 2:
        pixels = pixels[np.newaxis, ...]
    elif pixels.ndim == 4:
        if pixels.shape[-1] in (3, 4):
            pixels = pixels[..., 0]
        else:
            pixels = pixels[:, 0, :, :]
    elif pixels.ndim != 3:
        raise ValueError(f"Unsupported DICOM pixel array shape: {pixels.shape}")

    frame_count = int(pixels.shape[0])
    if frame_count <= 0:
        raise ValueError("DICOM has no frames")

    indices = np.linspace(0, frame_count - 1, num_frames, dtype=int).tolist()
    imgs: List[Image.Image] = []
    for index in indices:
        frame_u8 = _normalize_frame_to_uint8(pixels[index])
        img = Image.fromarray(frame_u8, mode="L").convert("RGB")
        imgs.append(img.resize((224, 224), Image.BILINEAR))
    return imgs


def pick_frames_from_instance(instance_id: str, num_frames: int = 16) -> List[Image.Image]:
    """
    Fetch approximately `num_frames` evenly spaced rendered frames for an Orthanc instance.
    Returns a list of RGB PIL images resized to 224x224.
    """
    # Get instance metadata to know number of frames
    logger.debug("[INFERENCE_FUNCTIONS] Sampling frames from Orthanc instance %s", instance_id)
    meta = requests.get(
        f"{orthanc_url}/instances/{instance_id}",
        auth=(orthanc_user, orthanc_pass),
        timeout=10,
    ).json()
    frames_list = requests.get(
        f"{orthanc_url}/instances/{instance_id}/frames",
        auth=(orthanc_user, orthanc_pass),
        timeout=10,
    ).json()
    frames = len(frames_list) if isinstance(frames_list, list) else int(meta.get("MainDicomTags", {}).get("NumberOfFrames", 1))
    # Pick 16 approximately evenly spaced frame indices (1-based in Orthanc HTTP)
    indices = [max(1, min(frames, 1 + math.floor(i * frames / num_frames))) for i in range(num_frames)]
    imgs: List[Image.Image] = []
    for idx in indices:
        # rendered PNG/JPEG of that frame
        # /instances/{id}/frames/{frame}/rendered  (Orthanc returns image bytes)
        resp = requests.get(
            f"{orthanc_url}/instances/{instance_id}/frames/{idx}/rendered",
            auth=(orthanc_user, orthanc_pass),
            timeout=10,
        )
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        img = img.resize((224, 224), Image.BILINEAR)
        imgs.append(img)
    logger.debug("[INFERENCE_FUNCTIONS] Collected %d Orthanc-rendered frame(s)", len(imgs))
    return imgs

def stack_to_tensor(frames: List[Image.Image]) -> torch.Tensor:
    logger.debug("[INFERENCE_FUNCTIONS] Stacking %d frame(s) into tensor", len(frames))
    # frames: list of PIL RGB 224x224; output: (1,3,T,224,224), normalized ImageNet
    arr = np.stack([np.asarray(f).astype(np.float32) / 255.0 for f in frames], axis=0)  # (T, H, W, C)
    # ImageNet mean/std
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)[None, None, None, :]
    std  = np.array([0.229, 0.224, 0.225], dtype=np.float32)[None, None, None, :]
    arr = (arr - mean) / std
    arr = np.transpose(arr, (3, 0, 1, 2))  # (C, T, H, W)
    t = torch.from_numpy(arr).unsqueeze(0)  # (1, C, T, H, W)
    logger.debug("[INFERENCE_FUNCTIONS] Tensor shape: %s dtype=%s", tuple(t.shape), t.dtype)
    return t

# Lazy load the model once
_model = None
_device = None

def get_model_and_device() -> Tuple[torch.nn.Module, torch.device]:
    """
    Lazily load the local PanEcho model (CPU or GPU) once and reuse it
    across calls.
    """
    global _model, _device
    if _model is None:
        # pick device explicitly
        _device = get_device_for_model("panecho")
        start = time.time()
        logger.info(f"[INFERENCE_FUNCTIONS] Loading PanEcho model on device: {_device}")
        
        # Local PanEcho repo path (vendored)
        local_repo_dir = (Path(__file__).resolve().parents[2] / "AI_models" / "PanEcho").resolve()
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
        logger.info("[INFERENCE_FUNCTIONS] PanEcho (local) loaded successfully in %.1fs", time.time() - start)

    return _model, _device


def unload_panecho_model() -> None:
    """
    Unload cached PanEcho model and clear accelerator memory.
    """
    global _model, _device
    if _model is not None:
        del _model
        _model = None
    _device = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

