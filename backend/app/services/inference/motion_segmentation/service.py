from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.artifacts import (
    LV_SEGMENTATION_OVERLAY_KIND,
    LV_SEGMENTATION_OVERLAY_TYPE,
)
from app.database_models.instances import Instance
from app.helpers.inference_runtime.batch_config import get_batch_size
from app.helpers.inference_runtime.device_selector import get_device_for_model
from app.helpers.inference_runtime.inference_functions import check_instance_exists_in_orthanc
from app.helpers.media.dicom_frame_reader import read_dicom_frames
from app.helpers.media.mask_rle import empty_rle, encode_binary_mask_rle
from app.services.inference.motion_segmentation.inference import (
    iter_lv_probabilities,
    load_motion_segmentation_model,
    unload_motion_segmentation_model,
)
from app.services.inference.motion_segmentation.overlay_document import (
    build_overlay_document,
    persist_overlay_result,
)
from app.services.inference.motion_segmentation.postprocess import (
    binarize_and_clean,
    foreground_confidence,
)

logger = logging.getLogger(__name__)


# Part 1. Load source frames without modifying source geometry.
def _load_frames(dicom_file_path: str) -> tuple[list[np.ndarray], float, tuple[int, int]]:
    suffix = Path(dicom_file_path).suffix.lower()

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
            ) from exc
        if not frames:
            raise HTTPException(status_code=400, detail="No frames found in DICOM")
        return frames, fps, (frames[0].shape[1], frames[0].shape[0])

    if suffix == ".avi":
        cap = cv2.VideoCapture(dicom_file_path)
        if not cap.isOpened():
            raise HTTPException(status_code=400, detail="Could not open input video")
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_size = (
            int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        )
        frames = []
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                frames.append(frame)
        finally:
            cap.release()
        if not frames or frame_size[0] <= 0 or frame_size[1] <= 0:
            raise HTTPException(status_code=400, detail="No frames found in video")
        return frames, fps, frame_size

    raise HTTPException(status_code=400, detail="Only .avi or .dcm files are supported")


# Part 2. Run model inference and encode each frame as source-resolution RLE.
def _segment_frames(
    *,
    frames: list[np.ndarray],
    frame_size: tuple[int, int],
    batch_size: int,
    defer_model_unload: bool,
) -> tuple[list[dict[str, Any]], str]:
    width, height = frame_size

    def collect(target_device: torch.device) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for prob_small in iter_lv_probabilities(frames, target_device, batch_size):
            confidence = foreground_confidence(prob_small)
            mask = binarize_and_clean(prob_small, frame_size)
            area = int(mask.sum())
            present = area > 0
            rle = encode_binary_mask_rle(mask) if present else empty_rle(height, width)
            results.append(
                {
                    "rle": rle,
                    "area_px": area,
                    "confidence": round(confidence, 4),
                    "present": present,
                }
            )
        return results

    preferred_device = get_device_for_model("motion_segmentation")
    logger.info(
        "[MotionSegmentation] Starting structured LV segmentation | frames=%d size=%s device=%s",
        len(frames),
        frame_size,
        preferred_device.type,
    )
    try:
        return collect(preferred_device), preferred_device.type
    except Exception as primary_err:
        logger.warning(
            "[MotionSegmentation] Preferred path failed: %s | Falling back to CPU",
            primary_err,
        )
        unload_motion_segmentation_model()
        try:
            return collect(torch.device("cpu")), "cpu"
        except Exception as cpu_err:
            logger.exception("[MotionSegmentation] CPU fallback also failed")
            raise HTTPException(
                status_code=500,
                detail=f"LV segmentation failed on both preferred device and CPU: {cpu_err}",
            ) from cpu_err
    finally:
        if not defer_model_unload:
            unload_motion_segmentation_model()


# Part 3. Build and persist the structured overlay document.
def _run_structured(
    *,
    instance: Instance,
    db: Session,
    frames: list[np.ndarray],
    fps: float,
    frame_size: tuple[int, int],
    artifact_set_id: int | None,
    defer_model_unload: bool,
) -> dict[str, Any]:
    start = time.time()
    frame_results, device_type = _segment_frames(
        frames=frames,
        frame_size=frame_size,
        batch_size=get_batch_size("motion_segmentation"),
        defer_model_unload=defer_model_unload,
    )
    document = build_overlay_document(
        instance=instance,
        frame_results=frame_results,
        frame_width=frame_size[0],
        frame_height=frame_size[1],
        fps=fps,
        device_type=device_type,
        duration_s=time.time() - start,
    )
    persist_overlay_result(
        db=db,
        instance=instance,
        artifact_set_id=artifact_set_id,
        document=document,
    )
    quality = document["quality"]
    logger.info(
        "[MotionSegmentation] Saved structured overlay | study_uid=%s frames=%d with_mask=%d mean_conf=%.3f",
        instance.series.study.study_uid,
        document["frame_count"],
        quality["frames_with_mask"],
        quality["mean_confidence"],
    )
    return {
        "success": True,
        "message": "LV segmentation completed successfully",
        "overlay_type": LV_SEGMENTATION_OVERLAY_TYPE,
        "kind": LV_SEGMENTATION_OVERLAY_KIND,
        "has_overlay": quality["frames_with_mask"] > 0,
        "frame_count": document["frame_count"],
        "mean_confidence": quality["mean_confidence"],
        "output_file": None,
    }


# Part 4. Public service entrypoint used by API and pipeline callers.
def run_motion_segmentation(
    *,
    sop_instance_uid: str,
    db: Session,
    artifact_set_id: int | None = None,
    skip_orthanc_check: bool = False,
    defer_model_unload: bool = False,
):
    """Run LV segmentation and persist a structured overlay document."""
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

    frames, fps, frame_size = _load_frames(dicom_file_path)
    result = _run_structured(
        instance=instance,
        db=db,
        frames=frames,
        fps=fps,
        frame_size=frame_size,
        artifact_set_id=artifact_set_id,
        defer_model_unload=defer_model_unload,
    )
    logger.info("[MotionSegmentation] LV-segmentation inference completed")
    return result


__all__ = [
    "load_motion_segmentation_model",
    "run_motion_segmentation",
    "unload_motion_segmentation_model",
]
