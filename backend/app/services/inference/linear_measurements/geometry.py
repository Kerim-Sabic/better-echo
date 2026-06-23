from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import cv2
import numpy as np

from app.services.inference.linear_measurements.inference import MODEL_INPUT_SIZE

try:
    import pydicom
    from pydicom.pixel_data_handlers.util import convert_color_space
except Exception:  # pragma: no cover
    pydicom = None
    convert_color_space = None


@dataclass(frozen=True)
class DicomScale:
    conv_x_cm: float
    conv_y_cm: float
    ratio_w: float
    ratio_h: float


@dataclass(frozen=True)
class LinearMeasurementInputs:
    source_frames_bgr: list[np.ndarray]
    model_frames_bgr: list[np.ndarray]
    fps: float
    frame_width: int
    frame_height: int
    dicom_scale: Optional[DicomScale]


def _normalize_uint8(image: np.ndarray) -> np.ndarray:
    if image.dtype == np.uint8:
        return image
    array = image.astype(np.float32)
    minimum, maximum = float(np.min(array)), float(np.max(array))
    if maximum <= minimum:
        return np.zeros_like(array, dtype=np.uint8)
    array = (array - minimum) / (maximum - minimum)
    return (array * 255.0).clip(0, 255).astype(np.uint8)


def _ensure_three_channel(frame: np.ndarray) -> np.ndarray:
    if frame.ndim == 2:
        return np.stack([frame, frame, frame], axis=-1)
    if frame.ndim == 3 and frame.shape[-1] == 1:
        return np.repeat(frame, 3, axis=-1)
    return frame


def _dicom_fps(ds: Any) -> float:
    cine_rate = getattr(ds, "CineRate", None)
    frame_time = getattr(ds, "FrameTime", None)
    if isinstance(cine_rate, (int, float)) and cine_rate > 0:
        return float(cine_rate)
    if isinstance(frame_time, (int, float)) and frame_time > 0:
        return max(1.0, 1000.0 / float(frame_time))
    return 30.0


def _iter_pixel_frames(ds: Any) -> list[np.ndarray]:
    pixel_array = ds.pixel_array
    number_of_frames = int(getattr(ds, "NumberOfFrames", 1) or 1)

    if pixel_array.ndim == 2:
        return [pixel_array]
    if pixel_array.ndim == 4:
        return [pixel_array[index] for index in range(pixel_array.shape[0])]
    if pixel_array.ndim == 3 and pixel_array.shape[-1] in (3, 4) and number_of_frames <= 1:
        return [pixel_array]
    if pixel_array.ndim == 3:
        return [pixel_array[index] for index in range(pixel_array.shape[0])]
    raise ValueError("Unsupported DICOM pixel array shape for 2D measurements.")


def _frame_to_bgr(frame: np.ndarray, photometric: str) -> np.ndarray:
    image = _ensure_three_channel(_normalize_uint8(frame))
    if photometric == "YBR_FULL_422" and convert_color_space is not None:
        try:
            image = convert_color_space(image, current="YBR_FULL_422", desired="RGB")
        except Exception:
            pass
    if image.ndim != 3 or image.shape[-1] != 3:
        raise ValueError("Unsupported image format for 2D measurements.")
    return cv2.cvtColor(image, cv2.COLOR_RGB2BGR)


def _safe_float(value: Any) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except Exception:
        return None


def _extract_dicom_scale(ds: Any, *, frame_width: int, frame_height: int) -> Optional[DicomScale]:
    conv_x_cm = None
    conv_y_cm = None

    ultrasound_regions_tag = (0x0018, 0x6011)
    region_x0_tag = (0x0018, 0x6018)
    region_y0_tag = (0x0018, 0x601A)
    region_x1_tag = (0x0018, 0x601C)
    region_y1_tag = (0x0018, 0x601E)
    delta_x_tag = (0x0018, 0x602C)
    delta_y_tag = (0x0018, 0x602E)

    if ultrasound_regions_tag in ds:
        regions_with_coords = []
        for region in ds[ultrasound_regions_tag].value:
            coords = [
                region[tag].value if tag in region else None
                for tag in (region_x0_tag, region_y0_tag, region_x1_tag, region_y1_tag)
            ]
            if all(coord is not None for coord in coords):
                regions_with_coords.append((region, coords))
        if regions_with_coords:
            regions_with_coords.sort(key=lambda item: item[1][1], reverse=True)
            region = regions_with_coords[0][0]
            if delta_x_tag in region:
                conv_x_cm = abs(float(region[delta_x_tag].value))
            if delta_y_tag in region:
                conv_y_cm = abs(float(region[delta_y_tag].value))

    if (conv_x_cm is None or conv_y_cm is None) and (0x0028, 0x0030) in ds:
        pixel_spacing = ds[(0x0028, 0x0030)].value
        row_mm = _safe_float(pixel_spacing[0] if len(pixel_spacing) > 0 else None)
        col_mm = _safe_float(pixel_spacing[1] if len(pixel_spacing) > 1 else None)
        if row_mm is not None:
            conv_y_cm = conv_y_cm or (row_mm / 10.0)
        if col_mm is not None:
            conv_x_cm = conv_x_cm or (col_mm / 10.0)

    if conv_x_cm is None or conv_y_cm is None:
        return None

    model_width, model_height = MODEL_INPUT_SIZE
    return DicomScale(
        conv_x_cm=float(conv_x_cm),
        conv_y_cm=float(conv_y_cm),
        ratio_w=float(frame_width) / float(model_width),
        ratio_h=float(frame_height) / float(model_height),
    )


def _load_avi_inputs(input_path: str) -> LinearMeasurementInputs:
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open input video: {input_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames: list[np.ndarray] = []
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frames.append(frame)
    finally:
        cap.release()
    if not frames:
        raise ValueError("No frames read from video")

    frame_height, frame_width = frames[0].shape[:2]
    model_frames = [
        cv2.resize(frame, MODEL_INPUT_SIZE, interpolation=cv2.INTER_LINEAR)
        for frame in frames
    ]
    return LinearMeasurementInputs(
        source_frames_bgr=frames,
        model_frames_bgr=model_frames,
        fps=float(fps),
        frame_width=int(frame_width),
        frame_height=int(frame_height),
        dicom_scale=None,
    )


def _load_dicom_inputs(input_path: str) -> LinearMeasurementInputs:
    if pydicom is None:
        raise RuntimeError("pydicom is required to read DICOM inputs.")

    ds = pydicom.dcmread(input_path, force=True)
    photometric = str(getattr(ds, "PhotometricInterpretation", "")).upper()
    source_frames = [_frame_to_bgr(frame, photometric) for frame in _iter_pixel_frames(ds)]
    if not source_frames:
        raise ValueError("No frames extracted from DICOM")

    frame_height, frame_width = source_frames[0].shape[:2]
    model_frames = [
        cv2.resize(frame, MODEL_INPUT_SIZE, interpolation=cv2.INTER_LINEAR)
        for frame in source_frames
    ]
    return LinearMeasurementInputs(
        source_frames_bgr=source_frames,
        model_frames_bgr=model_frames,
        fps=_dicom_fps(ds),
        frame_width=int(frame_width),
        frame_height=int(frame_height),
        dicom_scale=_extract_dicom_scale(
            ds,
            frame_width=int(frame_width),
            frame_height=int(frame_height),
        ),
    )


def load_measurement_inputs(input_path: str) -> LinearMeasurementInputs:
    suffix = input_path.rsplit(".", 1)[-1].lower() if "." in input_path else ""
    if suffix == "avi":
        return _load_avi_inputs(input_path)
    if suffix == "dcm":
        return _load_dicom_inputs(input_path)
    raise ValueError("Only .avi or .dcm inputs are supported")


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def build_frame_geometry(
    *,
    predictions: np.ndarray,
    frame_width: int,
    frame_height: int,
    dicom_scale: Optional[DicomScale],
    measurement_name: str,
) -> list[dict[str, Any]]:
    model_width, model_height = MODEL_INPUT_SIZE
    scale_x = float(frame_width) / float(model_width)
    scale_y = float(frame_height) / float(model_height)

    frames: list[dict[str, Any]] = []
    for frame_index, prediction in enumerate(predictions):
        p0 = prediction[0]
        p1 = prediction[1]
        x0 = _clip(float(p0[0]) * scale_x, 0.0, float(frame_width - 1))
        y0 = _clip(float(p0[1]) * scale_y, 0.0, float(frame_height - 1))
        x1 = _clip(float(p1[0]) * scale_x, 0.0, float(frame_width - 1))
        y1 = _clip(float(p1[1]) * scale_y, 0.0, float(frame_height - 1))

        measurement: dict[str, Any] = {
            "name": measurement_name,
            "value": None,
            "units": None,
        }
        dx_model = abs(float(p1[0]) - float(p0[0]))
        dy_model = abs(float(p1[1]) - float(p0[1]))
        length_px = float(np.hypot(x1 - x0, y1 - y0))

        if dicom_scale is not None:
            dx_source = dx_model * dicom_scale.ratio_w
            dy_source = dy_model * dicom_scale.ratio_h
            length_cm = float(
                np.sqrt(
                    (dx_source * dicom_scale.conv_x_cm) ** 2
                    + (dy_source * dicom_scale.conv_y_cm) ** 2
                )
            )
            measurement.update(
                {
                    "value": round(length_cm, 4),
                    "units": "cm",
                    "length_px": round(length_px, 4),
                }
            )
        else:
            measurement.update(
                {
                    "length_px": round(length_px, 4),
                }
            )

        frames.append(
            {
                "frame_index": int(frame_index),
                "present": True,
                "points": [
                    {"id": "p0", "x": round(x0, 3), "y": round(y0, 3), "confidence": None},
                    {"id": "p1", "x": round(x1, 3), "y": round(y1, 3), "confidence": None},
                ],
                "segments": [
                    {"from": "p0", "to": "p1", "role": "measurement_line"}
                ],
                "measurement": measurement,
            }
        )

    return frames


__all__ = [
    "DicomScale",
    "LinearMeasurementInputs",
    "build_frame_geometry",
    "load_measurement_inputs",
]
