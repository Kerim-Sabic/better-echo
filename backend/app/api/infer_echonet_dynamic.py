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

from app.database.db import get_db
from app.schemas.infer_echonet_dynamic_schemas import LVSegmentationResponse
from app.models.instances import Instance
from app.models.derived_results import DerivedResult
from app.helpers.inference_functions import check_instance_exists_in_orthanc
from app.helpers.DICOM_to_AVI_converter import read_dicom_frames
from app.helpers.AVI_to_MP4_converter import ffmpeg_write_mp4_from_frames

logger = logging.getLogger(__name__)
router = APIRouter()

model = None
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHECKPOINT_PATH = os.path.normpath(os.path.join(
    BASE_DIR,
    "..", "AI_models", "EchonetDynamic", "output", "segmentation",
    "deeplabv3_resnet50_random", "best.pt"
))
UPLOAD_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "uploads", "echonet_dynamic_LV-segmentation_files"))
os.makedirs(UPLOAD_DIR, exist_ok=True)


def load_model():
    """
    Lazy load model when first inference request arrives.
    """
    global model
    if model is None:
        model = torchvision.models.segmentation.deeplabv3_resnet50(weights=None)
        model.classifier[-1] = torch.nn.Conv2d(
            model.classifier[-1].in_channels,
            1,
            kernel_size=model.classifier[-1].kernel_size,
        )
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
    study_upload_dir = os.path.join(UPLOAD_DIR, study_uid)
    os.makedirs(study_upload_dir, exist_ok=True)
    base_name = f"segmented_{Path(dicom_file_path).stem}"
    output_path_mp4 = os.path.join(study_upload_dir, base_name + ".mp4")

    model_instance = None

    def _overlay_frames():
        for idx, frame in enumerate(frames, start=1):
            img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            resized_for_model = cv2.resize(img_rgb, (112, 112), interpolation=cv2.INTER_LINEAR)
            img_tensor = F.to_tensor(resized_for_model).unsqueeze(0).to(device)

            with torch.no_grad():
                output = model_instance(img_tensor)["out"][0, 0]

            mask_small = (torch.sigmoid(output) > 0.5).cpu().numpy().astype(np.uint8)
            mask_resized = cv2.resize(mask_small, frame_size, interpolation=cv2.INTER_NEAREST)

            mask_color = np.zeros_like(frame)
            mask_color[mask_resized == 1] = [0, 0, 255]  # red mask
            overlay = cv2.addWeighted(frame, 0.7, mask_color, 0.3, 0)
            if overlay.shape[1] != frame_size[0] or overlay.shape[0] != frame_size[1]:
                overlay = cv2.resize(overlay, frame_size, interpolation=cv2.INTER_LINEAR)
            if idx % 50 == 0:
                logger.info("[Echonet-dynamic] Processed %d frames for overlay", idx)
            yield overlay

    try:
        model_instance = load_model()
        logger.info("[Echonet-dynamic] LV-segmentation model loaded")

        try:
            preset = "slow" if device.type == "cuda" else "medium"
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
                timeout_seconds=180.0,
            )
        except Exception as ff_err:
            logger.warning("[Echonet-dynamic] ffmpeg high-quality encode failed, falling back to OpenCV: %s", ff_err)
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            vw = cv2.VideoWriter(output_path_mp4, fourcc, float(fps), frame_size)
            if not vw.isOpened():
                raise HTTPException(status_code=500, detail="Failed to open video writer for output.")
            for idx, frame in enumerate(_overlay_frames(), start=1):
                vw.write(frame)
                if idx % 50 == 0:
                    logger.info("[Echonet-dynamic] OpenCV fallback progress: wrote %d frames", idx)
            vw.release()
    finally:
        if cap is not None:
            cap.release()
        unload_model()
        logger.info("[Echonet-dynamic] LV-segmentation model unloaded")

    relative_output_path = os.path.relpath(output_path_mp4, start=UPLOAD_DIR).replace("\\", "/")
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
