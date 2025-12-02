import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
import logging
import torch
import torchvision
from torchvision.transforms import functional as F
import cv2
import numpy as np
from collections import OrderedDict
import time

from app.database.db import get_db
from app.schemas.inference.infer_echonet_dynamic_schemas import LVSegmentationResponse
from app.database_models.instances import Instance
from app.database_models.derived_results import DerivedResult
from app.helpers.inference_functions import check_instance_exists_in_orthanc
from app.helpers.DICOM_to_AVI_converter import read_dicom_frames
from app.helpers.AVI_to_MP4_converter import ffmpeg_write_mp4_from_frames
from app.helpers.device_selector import get_device_for_model
from app.helpers.batch_config import get_batch_size
from app.core.artifacts import BASE_DIR, UPLOAD_DIR

logger = logging.getLogger(__name__)
router = APIRouter()

model = None
device: torch.device | None = None

CHECKPOINT_PATH = os.path.normpath(os.path.join(
    BASE_DIR,
    "..", "AI_models", "EchonetDynamic", "output", "segmentation",
    "deeplabv3_resnet50_random", "best.pt"
))
ECHONET_DYNAMIC_UPLOAD_DIR = os.path.normpath(os.path.join(UPLOAD_DIR, "echonet_dynamic_LV-segmentation_files"))
os.makedirs(ECHONET_DYNAMIC_UPLOAD_DIR, exist_ok=True)


def load_model():
    """
    Lazy load model when first inference request arrives.
    """
    global model, device
    if model is None:
        if device is None:
            device = get_device_for_model("echonet")

        model = torchvision.models.segmentation.deeplabv3_resnet50(weights=None)
        model.classifier[-1] = torch.nn.Conv2d(
            model.classifier[-1].in_channels,
            1,
            kernel_size=model.classifier[-1].kernel_size,
        )
        try:
            checkpoint = torch.load(CHECKPOINT_PATH, map_location=device, weights_only=True)
        except TypeError:
            checkpoint = torch.load(CHECKPOINT_PATH, map_location=device)
        state_dict = checkpoint["state_dict"]

        # strip "module." or "model." prefixes
        new_state_dict = OrderedDict()
        for k, v in state_dict.items():
            name = k
            if name.startswith("module."):
                name = name[len("module.") :]
            if name.startswith("model."):
                name = name[len("model.") :]
            new_state_dict[name] = v

        model.load_state_dict(new_state_dict, strict=False)
        model.to(device)
        model.eval()
    return model


def unload_model():
    """
    Unload model to free GPU/CPU memory.
    """
    global model
    if model is not None:
        del model
        model = None
        torch.cuda.empty_cache()


@router.post("/infer/echonet-dynamic/LV-segmentation", response_model=LVSegmentationResponse)
def infer_lv_segmentation(
    sop_instance_uid: str = Query(..., description="The DICOM SOPInstanceUID to run segmentation on"),
    db: Session = Depends(get_db),
):
    """
    Perform LV (Left Ventricle) segmentation using EchoNet-Dynamic and return an annotated MP4 for the frontend.

    Steps:
    1. Validate that the instance exists in Orthanc and in the local database.
    2. Resolve the DICOM/AVI path and load frames (no DICOM -> AVI intermediate).
    3. Lazily load the segmentation model and render overlays.
    4. Encode overlays once to high-quality H.264 MP4 via ffmpeg (fallback to OpenCV if needed).
    5. Persist a DerivedResult and return the relative MP4 path.
    """
    # --- Step 1: Check if instance with given sop_instance_uid exists ---
    if not check_instance_exists_in_orthanc(sop_instance_uid):
        raise HTTPException(
            status_code=400,
            detail=f"Instance with sop_instance_uid: {sop_instance_uid} does not exist.",
        )

    # --- Step 2: Get instance from database ---
    instance = db.query(Instance).filter(Instance.sop_instance_uid == sop_instance_uid).first()
    if not instance:
        raise HTTPException(
            status_code=400,
            detail=f"No instance found with sop_instance_uid={sop_instance_uid}",
        )

    dicom_file_path = instance.file_path
    if not dicom_file_path or not os.path.exists(dicom_file_path):
        raise HTTPException(
            status_code=400,
            detail=f"DICOM file not found at {dicom_file_path}",
        )

    # --- Step 3: Load frames and determine FPS/dimensions (avoid DICOM -> AVI intermediate) ---
    suffix = Path(dicom_file_path).suffix.lower()
    frames = None
    cap = None
    fps = 30.0
    frames = None
    cap = None
    fps = 30.0
    frame_size = None

    if suffix == ".dcm":
        logger.info("[Echonet-dynamic] Reading frames directly from DICOM")
        try:
            frames, fps = read_dicom_frames(dicom_file_path, apply_mask=True)
        except Exception as exc:
            logger.exception("[Echonet-dynamic] Failed to read DICOM frames")
            raise HTTPException(status_code=400, detail=f"Failed to read frames from DICOM: {exc}")
        if not frames:
            raise HTTPException(status_code=400, detail="No frames found in DICOM")
        frame_size = (frames[0].shape[1], frames[0].shape[0])  # (width, height)
    elif suffix == ".avi":
        cap = cv2.VideoCapture(dicom_file_path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open input video")
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_size = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
        if frame_size[0] <= 0 or frame_size[1] <= 0:
            raise HTTPException(status_code=400, detail="Invalid input video dimensions")
        collected = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            collected.append(frame)
        frames = collected
    else:
        raise HTTPException(status_code=400, detail="Only .avi or .dcm files are supported")

    if not frames:
        raise HTTPException(status_code=400, detail="No frames available for LV segmentation.")

    encode_size = (frame_size[0] - (frame_size[0] % 2), frame_size[1] - (frame_size[1] % 2))
    if encode_size[0] <= 0 or encode_size[1] <= 0:
        raise HTTPException(status_code=400, detail="Invalid frame dimensions for encoding.")
    if encode_size != frame_size:
        logger.info("[Echonet-dynamic] Adjusted frame size to even dimensions for H.264: %s -> %s", frame_size, encode_size)
        frame_size = encode_size

    logger.info(
        "[Echonet-dynamic] Starting LV segmentation encode | frames=%d size=%s fps=%.2f device=%s",
        len(frames),
        frame_size,
        float(fps),
        device.type,
    )

    # --- Step 4: Encode overlay video via ffmpeg (fallback to OpenCV if needed) ---
    study_uid = instance.series.study.study_uid
    study_upload_dir = os.path.join(ECHONET_DYNAMIC_UPLOAD_DIR, study_uid)
    os.makedirs(study_upload_dir, exist_ok=True)
    base_name = f"segmented_{Path(dicom_file_path).stem}"
    output_path_mp4 = os.path.join(study_upload_dir, base_name + ".mp4")

    def encode_on_device(target_device: torch.device, allow_ffmpeg: bool) -> str:
        global device
        if device != target_device:
            unload_model()
            device = target_device

        model_instance = load_model()
        logger.info("[Echonet-dynamic] Using batched inference | batch_size=%d device=%s", get_batch_size("echonet"), device)
        batch_size = get_batch_size("echonet")

        def _overlay_frames():
            start_time = time.time()
            total = len(frames)
            for batch_start in range(0, total, batch_size):
                batch_end = min(batch_start + batch_size, total)
                batch_frames = frames[batch_start:batch_end]

                tensors = []
                for frame in batch_frames:
                    img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    resized_for_model = cv2.resize(img_rgb, (112, 112), interpolation=cv2.INTER_LINEAR)
                    tensors.append(F.to_tensor(resized_for_model))

                batch_tensor = torch.stack(tensors).to(device)  # (B,3,112,112)
                with torch.no_grad():
                    outputs = model_instance(batch_tensor)["out"][:, 0]  # (B,112,112)

                for local_idx, output in enumerate(outputs):
                    frame = batch_frames[local_idx]
                    mask_small = (torch.sigmoid(output) > 0.5).cpu().numpy().astype(np.uint8)
                    mask_resized = cv2.resize(mask_small, frame_size, interpolation=cv2.INTER_NEAREST)

                    # Build a green outline (transparent fill)
                    mask_binary = (mask_resized > 0).astype(np.uint8)
                    # Soften edges: blur then a gentle open/close with an elliptical kernel
                    mask_smooth = cv2.GaussianBlur(mask_binary * 255, (7, 7), 0)
                    _, mask_binary = cv2.threshold(mask_smooth, 127, 1, cv2.THRESH_BINARY)
                    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
                    mask_binary = cv2.morphologyEx(mask_binary, cv2.MORPH_OPEN, kernel, iterations=1)
                    mask_binary = cv2.morphologyEx(mask_binary, cv2.MORPH_CLOSE, kernel, iterations=1)

                    contours, _ = cv2.findContours(mask_binary.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    if not contours:
                        yield frame
                        continue
                    largest = max(contours, key=cv2.contourArea)
                    overlay = frame.copy()
                    approx = cv2.approxPolyDP(largest, 2.5, True)
                    cv2.drawContours(overlay, [approx], -1, (0, 255, 0), 2, lineType=cv2.LINE_AA)

                    global_idx = batch_start + local_idx + 1
                    if global_idx <= 5 or global_idx % max(10, batch_size) == 0 or global_idx == total:
                        elapsed = time.time() - start_time
                        logger.info("[Echonet-dynamic] Processed %d/%d frames (%.1fs elapsed, device=%s)", global_idx, total, elapsed, device.type)
                    yield overlay

        try:
            preset = "slow" if device.type == "cuda" else "medium"
            if allow_ffmpeg:
                encode_start = time.time()
                logger.info(
                    "[Echonet-dynamic] Encoding overlay via ffmpeg | frames=%d size=%s fps=%.2f preset=%s device=%s",
                    len(frames),
                    frame_size,
                    float(fps),
                    preset,
                    device.type,
                )
                ffmpeg_write_mp4_from_frames(
                    frames=_overlay_frames(),
                    width=frame_size[0],
                    height=frame_size[1],
                    fps=float(fps),
                    output_path=output_path_mp4,
                    crf=16,
                    preset=preset,
                    timeout_seconds=90.0,
                    per_frame_timeout=30.0,
                )
                encode_duration = time.time() - encode_start
                logger.info(
                    "[Echonet-dynamic] ffmpeg encode completed in %.1fs | device=%s size=%s",
                    encode_duration,
                    device.type,
                    frame_size,
                )
                return output_path_mp4

            encode_start = time.time()
            logger.info(
                "[Echonet-dynamic] Using OpenCV writer (no ffmpeg) | frames=%d size=%s fps=%.2f device=%s",
                len(frames),
                frame_size,
                float(fps),
                device.type,
            )
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            vw = cv2.VideoWriter(output_path_mp4, fourcc, float(fps), frame_size)
            if not vw.isOpened():
                raise HTTPException(status_code=500, detail="Failed to open video writer for output.")
            written = 0
            try:
                for idx, frame in enumerate(_overlay_frames(), start=1):
                    vw.write(frame)
                    written = idx
                    if idx % 10 == 0:
                        logger.info("[Echonet-dynamic] OpenCV progress: wrote %d/%d frames (device=%s)", idx, len(frames), device.type)
            finally:
                encode_duration = time.time() - encode_start
                logger.info(
                    "[Echonet-dynamic] OpenCV encode completed with %d frames in %.1fs | device=%s size=%s",
                    written,
                    encode_duration,
                    device.type,
                    frame_size,
                )
                vw.release()
            return output_path_mp4
        finally:
            unload_model()

    result_path = None
    overall_start = time.time()
    try:
        preferred_device = get_device_for_model("echonet")
        logger.info("[Echonet-dynamic] Attempting encode on preferred device: %s", preferred_device)
        result_path = encode_on_device(preferred_device, allow_ffmpeg=preferred_device.type == "cuda")
        overall_duration = time.time() - overall_start
        logger.info("[Echonet-dynamic] Preferred device path succeeded in %.1fs", overall_duration)
    except Exception as err_primary:
        logger.warning(
            "[Echonet-dynamic] Preferred path failed after %.1fs: %s | Falling back to CPU",
            time.time() - overall_start,
            err_primary,
        )
        try:
            fallback_start = time.time()
            result_path = encode_on_device(torch.device("cpu"), allow_ffmpeg=False)
            fallback_duration = time.time() - fallback_start
            logger.info("[Echonet-dynamic] CPU fallback succeeded in %.1fs", fallback_duration)
        except Exception as err_cpu:
            logger.exception("[Echonet-dynamic] CPU fallback also failed")
            if cap is not None:
                cap.release()
            raise HTTPException(status_code=500, detail=f"LV segmentation failed on both preferred device and CPU: {err_cpu}")

    if cap is not None:
        cap.release()
    logger.info("[Echonet-dynamic] LV-segmentation model unloaded")

    if not result_path:
        raise HTTPException(status_code=500, detail="LV segmentation failed: no output path produced.")

    relative_output_path = os.path.relpath(result_path, start=ECHONET_DYNAMIC_UPLOAD_DIR).replace("\\", "/")
    relative_output_path = f"echonet_dynamic_LV-segmentation_files/{relative_output_path}"

    # --- Step 5: Save DerivedResult in database ---
    if instance:
        dr = DerivedResult(
            study_id=instance.series.study.id,
            instance_id=instance.id,
            type="EchonetDynamic_LV_Segmentation",
            value_json=f'{{"outputfile": "{relative_output_path}"}}',
            model_name="EchonetDynamic",
            model_version="v1",
        )
        # Check if the result already exists in the DB
        existing = db.query(DerivedResult).filter(
            DerivedResult.instance_id == instance.id,
            DerivedResult.type == "EchonetDynamic_LV_Segmentation",
        ).first()

        if not existing:
            db.add(dr)
            db.commit()
            logger.info(f"[Echonet-dynamic] Saved DerivedResult in DB for study_uid={study_uid}")

    # --- Step 6: Return success response ---
    logger.info("[Echonet-dynamic] LV-segmentation model inference completed")
    return {
        "success": True,
        "message": "LV segmentation completed successfully",
        "output_file": relative_output_path,
    }
