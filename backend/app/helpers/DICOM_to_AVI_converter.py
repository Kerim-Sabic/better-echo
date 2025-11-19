import logging
import os
from pathlib import Path
import numpy as np
import cv2
import pydicom as dicom

logger = logging.getLogger(__name__)


def _to_uint8(img: np.ndarray) -> np.ndarray:
    # Normalize any bit-depth image to uint8 for OpenCV video writer
    img = img.astype(np.float32)
    mn, mx = np.min(img), np.max(img)
    if mx > mn:
        img = (img - mn) / (mx - mn) * 255.0
    else:
        img = np.zeros_like(img)
    return img.astype(np.uint8)


def mask_frame(frame: np.ndarray) -> np.ndarray:
    # frame is square (N, N) uint8
    dimension = frame.shape[0]
    m1, m2 = np.meshgrid(np.arange(dimension), np.arange(dimension))
    mask = ((m1 + m2) > int(dimension / 2) + int(dimension / 10))
    mask &= ((m1 - m2) < int(dimension / 2) + int(dimension / 10))
    mask = mask.astype(np.uint8)
    return cv2.bitwise_and(frame, frame, mask=mask)


def _get_fps(ds) -> float:
    # Prefer CineRate, fallback to FrameTime (ms), else 30
    cine_rate = getattr(ds, "CineRate", None)
    frame_time = getattr(ds, "FrameTime", None)  # ms
    if isinstance(cine_rate, (int, float)) and cine_rate > 0:
        return float(cine_rate)
    if isinstance(frame_time, (int, float)) and frame_time > 0:
        return max(1.0, 1000.0 / float(frame_time))
    return 30.0


def dicom_to_avi(dicom_path: str, output_path: str, crop_size=(112, 112)) -> str:
    """
    Convert US cine DICOM to AVI. Robust to:
      - 2D, 3D (F,H,W), or 4D (F,H,W,C) pixel arrays
      - Different bit depths and VOI LUT
      - Missing 'blank top' rows
      - CineRate vs FrameTime FPS encodings
    """
    try:
        ds = dicom.dcmread(dicom_path, force=True)

        # Use pydicom handlers to get properly scaled pixels if present
        px = ds.pixel_array  # may be (H,W), (F,H,W), or (F,H,W,C)

        # Ensure (F,H,W) grayscale stack
        if px.ndim == 2:
            px = px[np.newaxis, ...]  # (1, H, W)
        elif px.ndim == 4:
            # take first channel
            px = px[..., 0]  # (F, H, W)

        F, H, W = px.shape

        # Optional top blank crop: detect rows that are ~near min intensity
        frame0 = px[0]
        frame0_u8 = _to_uint8(frame0)
        row_means = frame0_u8.mean(axis=1)  # (H,)
        thr = np.min(frame0_u8) + 0.01 * (np.max(frame0_u8) - np.min(frame0_u8))
        idxs = np.where(row_means < thr)[0]
        y_crop = int(idxs[0]) if idxs.size > 0 else 0
        if y_crop > 0 and y_crop < H - 8:
            px = px[:, y_crop:, :]
            H = px.shape[1]

        # Center-crop to square region
        if H != W:
            side = min(H, W)
            top = (H - side) // 2
            left = (W - side) // 2
            px = px[:, top:top + side, left:left + side]
            H = W = side

        # Gentle border trim (10%)
        trim = max(0, int(0.1 * H))
        if trim * 2 < H:
            px = px[:, trim:H - trim, trim:W - trim]
            H = W = px.shape[1]

        # Resize target
        target_w, target_h = crop_size
        fourcc = cv2.VideoWriter_fourcc(*"MJPG")
        fps = _get_fps(ds)

        out = cv2.VideoWriter(output_path, fourcc, float(fps), (target_w, target_h))
        if not out.isOpened():
            raise RuntimeError("OpenCV VideoWriter failed to open.")

        for i in range(F):
            gray = _to_uint8(px[i])  # (H,W) uint8
            resized = cv2.resize(gray, (target_w, target_h), interpolation=cv2.INTER_CUBIC)
            masked = mask_frame(resized)  # (H,W)
            bgr = cv2.merge([masked, masked, masked])
            out.write(bgr)

        out.release()
        return output_path

    except Exception as err:
        logger.exception("Failed to convert %s to AVI: %s", dicom_path, err)
        return ""
