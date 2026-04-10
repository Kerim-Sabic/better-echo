import os
import time
from collections import OrderedDict
from pathlib import Path

import cv2
import numpy as np
import torch
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.artifacts import (
    MOTION_SEGMENTATION_MODEL_NAME,
    MOTION_SEGMENTATION_TYPE,
    MOTION_SEGMENTATION_UPLOAD_DIRNAME,
    UPLOAD_DIR,
)
from app.core.runtime_paths import model_assets_dir
from app.database_models.derived_results import DerivedResult
from app.database_models.instances import Instance
from app.helpers.inference_runtime.batch_config import get_batch_size
from app.helpers.inference_runtime.device_selector import get_device_for_model
from app.helpers.inference_runtime.inference_functions import check_instance_exists_in_orthanc
from app.helpers.media.dicom_frame_reader import read_dicom_frames
from app.helpers.media.ffmpeg_mp4_writer import ffmpeg_write_mp4_from_frames

import logging


logger = logging.getLogger(__name__)

model = None
device: torch.device | None = None

CHECKPOINT_PATH = os.path.normpath(
    os.path.join(str(model_assets_dir("motion_segmentation")), "best.pt")
)
MOTION_SEGMENTATION_UPLOAD_DIR = os.path.normpath(
    os.path.join(UPLOAD_DIR, MOTION_SEGMENTATION_UPLOAD_DIRNAME)
)
os.makedirs(MOTION_SEGMENTATION_UPLOAD_DIR, exist_ok=True)


def load_motion_segmentation_model():
    """Lazy load model when first inference request arrives."""
    global model, device
    if model is None:
        import torchvision

        if device is None:
            device = get_device_for_model("motion_segmentation")

        start = time.time()
        model_instance = torchvision.models.segmentation.deeplabv3_resnet50(
            weights=None
        )
        model_instance.classifier[-1] = torch.nn.Conv2d(
            model_instance.classifier[-1].in_channels,
            1,
            kernel_size=model_instance.classifier[-1].kernel_size,
        )
        try:
            checkpoint = torch.load(
                CHECKPOINT_PATH,
                map_location=device,
                weights_only=True,
            )
        except TypeError:
            checkpoint = torch.load(CHECKPOINT_PATH, map_location=device)
        state_dict = checkpoint["state_dict"]

        new_state_dict = OrderedDict()
        for key, value in state_dict.items():
            normalized_key = key
            if normalized_key.startswith("module."):
                normalized_key = normalized_key[len("module.") :]
            if normalized_key.startswith("model."):
                normalized_key = normalized_key[len("model.") :]
            new_state_dict[normalized_key] = value

        model_instance.load_state_dict(new_state_dict, strict=False)
        model_instance.to(device)
        model_instance.eval()
        model = model_instance
        logger.info(
            "[MotionSegmentation] Model loaded on %s in %.1fs",
            device,
            time.time() - start,
        )
    return model


def unload_motion_segmentation_model():
    """Unload model to free GPU/CPU memory."""
    global model
    if model is not None:
        del model
        model = None
        torch.cuda.empty_cache()


def run_motion_segmentation(
    *,
    sop_instance_uid: str,
    db: Session,
    artifact_set_id: int | None = None,
    skip_orthanc_check: bool = False,
    defer_model_unload: bool = False,
):
    """Perform LV segmentation and persist the derived MP4 artifact."""
    global device

    if (not skip_orthanc_check) and (
        not check_instance_exists_in_orthanc(sop_instance_uid)
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Instance with sop_instance_uid: {sop_instance_uid} does not exist.",
        )

    instance = (
        db.query(Instance).filter(Instance.sop_instance_uid == sop_instance_uid).first()
    )
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

    suffix = Path(dicom_file_path).suffix.lower()
    fps = 30.0
    frame_size = None
    cap = None

    if suffix == ".dcm":
        logger.info("[MotionSegmentation] Reading frames directly from DICOM")
        try:
            frames, fps = read_dicom_frames(
                dicom_file_path,
                apply_mask=False,
                preserve_geometry=True,
            )
        except Exception as exc:
            logger.exception("[MotionSegmentation] Failed to read DICOM frames")
            raise HTTPException(
                status_code=400,
                detail=f"Failed to read frames from DICOM: {exc}",
            )
        if not frames:
            raise HTTPException(status_code=400, detail="No frames found in DICOM")
        frame_size = (frames[0].shape[1], frames[0].shape[0])
    elif suffix == ".avi":
        cap = cv2.VideoCapture(dicom_file_path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open input video")
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_size = (
            int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        )
        if frame_size[0] <= 0 or frame_size[1] <= 0:
            raise HTTPException(
                status_code=400,
                detail="Invalid input video dimensions",
            )
        frames = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frames.append(frame)
    else:
        raise HTTPException(status_code=400, detail="Only .avi or .dcm files are supported")

    if not frames:
        raise HTTPException(
            status_code=400,
            detail="No frames available for LV segmentation.",
        )

    encode_size = (
        frame_size[0] - (frame_size[0] % 2),
        frame_size[1] - (frame_size[1] % 2),
    )
    if encode_size[0] <= 0 or encode_size[1] <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid frame dimensions for encoding.",
        )
    if encode_size != frame_size:
        logger.info(
            "[MotionSegmentation] Adjusted frame size to even dimensions for H.264: %s -> %s",
            frame_size,
            encode_size,
        )
        frame_size = encode_size

    if device is None:
        device = get_device_for_model("motion_segmentation")

    logger.info(
        "[MotionSegmentation] Starting LV segmentation encode | frames=%d size=%s fps=%.2f device=%s",
        len(frames),
        frame_size,
        float(fps),
        device.type,
    )

    study_uid = instance.series.study.study_uid
    study_upload_dir = os.path.join(MOTION_SEGMENTATION_UPLOAD_DIR, study_uid)
    os.makedirs(study_upload_dir, exist_ok=True)
    base_name = f"segmented_{Path(dicom_file_path).stem}"
    output_path_mp4 = os.path.join(study_upload_dir, base_name + ".mp4")

    def encode_on_device(target_device: torch.device, allow_ffmpeg: bool) -> str:
        global device
        from torchvision.transforms import functional as F

        if device != target_device:
            unload_motion_segmentation_model()
            device = target_device

        model_instance = load_motion_segmentation_model()
        batch_size = get_batch_size("motion_segmentation")
        logger.info(
            "[MotionSegmentation] Using batched inference | batch_size=%d device=%s",
            batch_size,
            device,
        )

        def overlay_frames():
            start_time = time.time()
            total = len(frames)
            for batch_start in range(0, total, batch_size):
                batch_end = min(batch_start + batch_size, total)
                batch_frames = frames[batch_start:batch_end]

                tensors = []
                for frame in batch_frames:
                    img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    resized_for_model = cv2.resize(
                        img_rgb,
                        (112, 112),
                        interpolation=cv2.INTER_LINEAR,
                    )
                    tensors.append(F.to_tensor(resized_for_model))

                batch_tensor = torch.stack(tensors).to(device)
                with torch.no_grad():
                    outputs = model_instance(batch_tensor)["out"][:, 0]

                for local_idx, output in enumerate(outputs):
                    frame = batch_frames[local_idx]
                    mask_small = (
                        (torch.sigmoid(output) > 0.5)
                        .cpu()
                        .numpy()
                        .astype(np.uint8)
                    )
                    mask_resized = cv2.resize(
                        mask_small,
                        frame_size,
                        interpolation=cv2.INTER_NEAREST,
                    )

                    mask_binary = (mask_resized > 0).astype(np.uint8)
                    mask_smooth = cv2.GaussianBlur(mask_binary * 255, (7, 7), 0)
                    _, mask_binary = cv2.threshold(
                        mask_smooth,
                        127,
                        1,
                        cv2.THRESH_BINARY,
                    )
                    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
                    mask_binary = cv2.morphologyEx(
                        mask_binary,
                        cv2.MORPH_OPEN,
                        kernel,
                        iterations=1,
                    )
                    mask_binary = cv2.morphologyEx(
                        mask_binary,
                        cv2.MORPH_CLOSE,
                        kernel,
                        iterations=1,
                    )

                    contours, _ = cv2.findContours(
                        mask_binary.astype(np.uint8),
                        cv2.RETR_EXTERNAL,
                        cv2.CHAIN_APPROX_SIMPLE,
                    )
                    if not contours:
                        yield frame
                        continue
                    largest = max(contours, key=cv2.contourArea)
                    overlay = frame.copy()
                    approx = cv2.approxPolyDP(largest, 2.5, True)
                    cv2.drawContours(
                        overlay,
                        [approx],
                        -1,
                        (0, 255, 0),
                        2,
                        lineType=cv2.LINE_AA,
                    )

                    global_idx = batch_start + local_idx + 1
                    if (
                        global_idx <= 5
                        or global_idx % max(10, batch_size) == 0
                        or global_idx == total
                    ):
                        elapsed = time.time() - start_time
                        logger.info(
                            "[MotionSegmentation] Processed %d/%d frames (%.1fs elapsed, device=%s)",
                            global_idx,
                            total,
                            elapsed,
                            device.type,
                        )
                    yield overlay

        try:
            preset = "slow" if device.type == "cuda" else "medium"
            if allow_ffmpeg:
                encode_start = time.time()
                logger.info(
                    "[MotionSegmentation] Encoding overlay via ffmpeg | frames=%d size=%s fps=%.2f preset=%s device=%s",
                    len(frames),
                    frame_size,
                    float(fps),
                    preset,
                    device.type,
                )
                ffmpeg_write_mp4_from_frames(
                    frames=overlay_frames(),
                    width=frame_size[0],
                    height=frame_size[1],
                    fps=float(fps),
                    output_path=output_path_mp4,
                    crf=16,
                    preset=preset,
                    timeout_seconds=90.0,
                    per_frame_timeout=30.0,
                )
                logger.info(
                    "[MotionSegmentation] ffmpeg encode completed in %.1fs | device=%s size=%s",
                    time.time() - encode_start,
                    device.type,
                    frame_size,
                )
                return output_path_mp4

            encode_start = time.time()
            logger.info(
                "[MotionSegmentation] Using OpenCV writer (no ffmpeg) | frames=%d size=%s fps=%.2f device=%s",
                len(frames),
                frame_size,
                float(fps),
                device.type,
            )
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(output_path_mp4, fourcc, float(fps), frame_size)
            if not writer.isOpened():
                raise HTTPException(
                    status_code=500,
                    detail="Failed to open video writer for output.",
                )
            written = 0
            try:
                for idx, frame in enumerate(overlay_frames(), start=1):
                    writer.write(frame)
                    written = idx
                    if idx % 10 == 0:
                        logger.info(
                            "[MotionSegmentation] OpenCV progress: wrote %d/%d frames (device=%s)",
                            idx,
                            len(frames),
                            device.type,
                        )
            finally:
                logger.info(
                    "[MotionSegmentation] OpenCV encode completed with %d frames in %.1fs | device=%s size=%s",
                    written,
                    time.time() - encode_start,
                    device.type,
                    frame_size,
                )
                writer.release()
            return output_path_mp4
        finally:
            if not defer_model_unload:
                unload_motion_segmentation_model()

    result_path = None
    overall_start = time.time()
    try:
        preferred_device = get_device_for_model("motion_segmentation")
        logger.info(
            "[MotionSegmentation] Attempting encode on preferred device: %s",
            preferred_device,
        )
        result_path = encode_on_device(
            preferred_device,
            allow_ffmpeg=preferred_device.type == "cuda",
        )
        logger.info(
            "[MotionSegmentation] Preferred device path succeeded in %.1fs",
            time.time() - overall_start,
        )
    except Exception as err_primary:
        logger.warning(
            "[MotionSegmentation] Preferred path failed after %.1fs: %s | Falling back to CPU",
            time.time() - overall_start,
            err_primary,
        )
        try:
            fallback_start = time.time()
            result_path = encode_on_device(torch.device("cpu"), allow_ffmpeg=False)
            logger.info(
                "[MotionSegmentation] CPU fallback succeeded in %.1fs",
                time.time() - fallback_start,
            )
        except Exception as err_cpu:
            logger.exception("[MotionSegmentation] CPU fallback also failed")
            if cap is not None:
                cap.release()
            raise HTTPException(
                status_code=500,
                detail=f"LV segmentation failed on both preferred device and CPU: {err_cpu}",
            )

    if cap is not None:
        cap.release()
    if not defer_model_unload:
        logger.info("[MotionSegmentation] LV-segmentation model unloaded")

    if not result_path:
        raise HTTPException(
            status_code=500,
            detail="LV segmentation failed: no output path produced.",
        )

    relative_output_path = os.path.relpath(
        result_path,
        start=MOTION_SEGMENTATION_UPLOAD_DIR,
    ).replace("\\", "/")
    relative_output_path = (
        f"{MOTION_SEGMENTATION_UPLOAD_DIRNAME}/{relative_output_path}"
    )

    if artifact_set_id is not None:
        derived_result = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.instance_id == instance.id,
                DerivedResult.type == MOTION_SEGMENTATION_TYPE,
                DerivedResult.artifact_set_id == artifact_set_id,
            )
            .first()
        )
        if not derived_result:
            derived_result = DerivedResult(
                study_id=instance.series.study.id,
                instance_id=instance.id,
                type=MOTION_SEGMENTATION_TYPE,
                model_name=MOTION_SEGMENTATION_MODEL_NAME,
                model_version="v1",
                artifact_set_id=artifact_set_id,
            )
            db.add(derived_result)
        derived_result.value_json = {"outputfile": relative_output_path}
        db.commit()
        logger.info(
            "[MotionSegmentation] Saved draft DerivedResult in DB for study_uid=%s",
            study_uid,
        )
    else:
        existing = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.instance_id == instance.id,
                DerivedResult.type == MOTION_SEGMENTATION_TYPE,
            )
            .first()
        )
        if not existing:
            db.add(
                DerivedResult(
                    study_id=instance.series.study.id,
                    instance_id=instance.id,
                    type=MOTION_SEGMENTATION_TYPE,
                    value_json={"outputfile": relative_output_path},
                    model_name=MOTION_SEGMENTATION_MODEL_NAME,
                    model_version="v1",
                )
            )
            db.commit()
            logger.info(
                "[MotionSegmentation] Saved DerivedResult in DB for study_uid=%s",
                study_uid,
            )

    logger.info("[MotionSegmentation] LV-segmentation model inference completed")
    return {
        "success": True,
        "message": "LV segmentation completed successfully",
        "output_file": relative_output_path,
    }
