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
from app.core.runtime_paths import (
    cache_dir,
    ensure_model_assets_available,
    model_assets_dir,
)
from app.helpers.inference_runtime import precision
from app.helpers.inference_runtime.device_selector import get_device_for_model

logger = logging.getLogger(__name__)

orthanc_url = settings.ORTHANC_URL
orthanc_user = settings.ORTHANC_USER
orthanc_pass = settings.ORTHANC_PASS

   
def _orthanc_lookup(uid: str) -> List[dict]:
    """Resolve a DICOM UID to Orthanc resources in one call via /tools/lookup."""
    resp = requests.post(
        f"{orthanc_url}/tools/lookup",
        data=uid,
        auth=(orthanc_user, orthanc_pass),
        timeout=10,
    )
    resp.raise_for_status()
    result = resp.json()
    return result if isinstance(result, list) else []


def check_instance_exists_in_orthanc(sop_instance_uid: str) -> bool:
    """
    Check if a DICOM instance (SOPInstanceUID) exists in Orthanc.
    Returns True if found, False otherwise.

    Uses Orthanc's O(1) /tools/lookup index; falls back to the legacy O(N)
    instance scan only if lookup is unavailable (older Orthanc, transient error).
    """
    logger.info(f"[INFERENCE_FUNCTIONS] Checking if instance exists in Orthanc: SOPInstanceUID={sop_instance_uid}")
    try:
        matches = _orthanc_lookup(sop_instance_uid)
        exists = any(entry.get("Type") == "Instance" for entry in matches)
        if exists:
            logger.info(f"[INFERENCE_FUNCTIONS] Instance {sop_instance_uid} exists in Orthanc.")
        else:
            logger.warning(f"[INFERENCE_FUNCTIONS] Instance {sop_instance_uid} not found in Orthanc.")
        return exists
    except requests.RequestException as e:
        logger.warning(f"[INFERENCE_FUNCTIONS] /tools/lookup failed ({e}); falling back to instance scan")
        return _check_instance_exists_scan(sop_instance_uid)


def _check_instance_exists_scan(sop_instance_uid: str) -> bool:
    try:
        r = requests.get(
            f"{orthanc_url}/instances",
            auth=(orthanc_user, orthanc_pass),
            timeout=10,
        )
        r.raise_for_status()
        for iid in r.json():
            r_info = requests.get(
                f"{orthanc_url}/instances/{iid}",
                auth=(orthanc_user, orthanc_pass),
                timeout=10,
            )
            r_info.raise_for_status()
            if r_info.json().get("MainDicomTags", {}).get("SOPInstanceUID") == sop_instance_uid:
                return True
        return False
    except requests.RequestException as e:
        logger.error(f"[INFERENCE_FUNCTIONS] Error checking instance in Orthanc: {e}")
        return False


def fetch_orthanc_instance_ids_from_study(study_uid: str) -> List[str]:
    """
    Resolve an Orthanc study by StudyInstanceUID and return a list of its instance IDs.

    Uses /tools/lookup to resolve the study in one call; falls back to the legacy
    O(N) study scan if lookup is unavailable.
    """
    logger.info(f"[INFERENCE_FUNCTIONS] Resolving Orthanc study for StudyInstanceUID={study_uid}")
    try:
        matches = _orthanc_lookup(study_uid)
        match = next((entry.get("ID") for entry in matches if entry.get("Type") == "Study"), None)
    except requests.RequestException as e:
        logger.warning(f"[INFERENCE_FUNCTIONS] /tools/lookup failed ({e}); falling back to study scan")
        return _fetch_study_instance_ids_scan(study_uid)

    if not match:
        logger.warning(f"[INFERENCE_FUNCTIONS] No Orthanc study matches StudyInstanceUID={study_uid}")
        return []

    insts = requests.get(
        f"{orthanc_url}/studies/{match}/instances",
        auth=(orthanc_user, orthanc_pass),
        timeout=10,
    ).json()
    ids = [i["ID"] for i in insts]
    logger.info(f"[INFERENCE_FUNCTIONS] Found {len(ids)} instance(s) in the study")
    return ids


def _fetch_study_instance_ids_scan(study_uid: str) -> List[str]:
    r = requests.get(
        f"{orthanc_url}/studies",
        auth=(orthanc_user, orthanc_pass),
        timeout=10,
    )
    r.raise_for_status()
    match = None
    for sid in r.json():
        info = requests.get(
            f"{orthanc_url}/studies/{sid}",
            auth=(orthanc_user, orthanc_pass),
            timeout=10,
        ).json()
        if info.get("MainDicomTags", {}).get("StudyInstanceUID") == study_uid:
            match = sid
            break
    if not match:
        return []
    insts = requests.get(
        f"{orthanc_url}/studies/{match}/instances",
        auth=(orthanc_user, orthanc_pass),
        timeout=10,
    ).json()
    return [i["ID"] for i in insts]


# Part 1. Normalize a DICOM frame into uint8 for primary-analysis frame sampling.
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


# Part 2. Fast local DICOM frame sampler for primary analysis.
def frames_from_pixel_array(pixels: np.ndarray, num_frames: int = 16) -> List[Image.Image]:
    """Sample evenly spaced frames from a decoded pixel array (no mutation)."""
    if num_frames <= 0:
        raise ValueError("num_frames must be >= 1")

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


def pick_frames_from_local_dicom(dicom_path: str, num_frames: int = 16) -> List[Image.Image]:
    if num_frames <= 0:
        raise ValueError("num_frames must be >= 1")

    ds = pydicom.dcmread(dicom_path, force=True)
    return frames_from_pixel_array(ds.pixel_array, num_frames)


PANECHO_TENSOR_RECIPE = "panecho_tensor"


def cached_panecho_tensor(cache, dicom_path: str, num_frames: int = 16) -> torch.Tensor:
    """
    Primary-analysis input tensor via the study frame cache: decode + frame
    sampling + normalization run once per instance per analysis job.
    """
    return cache.get_derived(
        dicom_path,
        f"{PANECHO_TENSOR_RECIPE}:{num_frames}",
        lambda decoded: stack_to_tensor(
            frames_from_pixel_array(decoded.pixel_array, num_frames)
        ),
    )


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
    Lazily load the local primary analysis model (CPU or GPU) once and reuse it
    across calls.
    """
    global _model, _device
    if _model is None:
        # pick device explicitly
        _device = get_device_for_model("primary_analysis")
        start = time.time()
        logger.info(f"[INFERENCE_FUNCTIONS] Loading primary analysis model on device: {_device}")

        ensure_model_assets_available("primary_analysis", ("repo_root", "weights_checkpoint"))
        
        # Local bundled runtime repo path (vendored)
        local_repo_dir = model_assets_dir("primary_analysis").resolve()
        hubconf_path = local_repo_dir / "hubconf.py"
        if not hubconf_path.exists():
            raise RuntimeError(
                f"Primary analysis runtime assets are missing at {local_repo_dir}."
                f"Expected hubconf.py at {hubconf_path}. Please vendor the repo and assets."
            )
        
        # Ensure a local torch hub cache under a writable runtime directory.
        torch_cache_dir = cache_dir("primary_analysis_torch_hub").resolve()
        os.environ.setdefault("TORCH_HOME", str(torch_cache_dir))
        try:
            torch_cache_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.warning(f"[INFERENCE_FUNCTIONS] Could not create TORCH_HOME at {torch_cache_dir}: {e}")
        
        # Strictly load from local repo (offline)
        _model = torch.hub.load(
            str(local_repo_dir),
            'load_primary_analysis_model',
            source='local',
            force_reload=False
        )
        _model.to(_device).eval()
        precision.configure_backends(_device)
        _model = precision.maybe_compile(_model, _device, label="primary_analysis")
        if bool(getattr(settings, "PRIMARY_ANALYSIS_WARMUP", False)):
            from app.helpers.inference_runtime.model_warmup import warmup_model

            # PanEcho input: (N, C=3, T=16, 224, 224)
            warmup_model(_model, (1, 3, 16, 224, 224), _device, label="primary_analysis")
        logger.info(
            "[INFERENCE_FUNCTIONS] Primary analysis model loaded successfully in %.1fs | %s",
            time.time() - start,
            precision.describe(_device).as_dict(),
        )

    return _model, _device


def unload_primary_analysis_model() -> None:
    """
    Unload cached primary analysis model and clear accelerator memory.
    """
    global _model, _device
    if _model is not None:
        del _model
        _model = None
    _device = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

