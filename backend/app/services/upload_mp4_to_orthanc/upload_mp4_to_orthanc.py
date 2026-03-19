import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import cv2
import numpy as np
import pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import (
    ExplicitVRLittleEndian,
    PYDICOM_IMPLEMENTATION_UID,
    SecondaryCaptureImageStorage,
    generate_uid,
)

from app.core.artifacts import UPLOAD_DIR
from app.services.integrations.orthanc_client import send_dicom_to_orthanc

logger = logging.getLogger(__name__)

DERIVED_SERIES_PREFIX = "HORALIX_AI_SEGMENTATION"


def _resolve_path(path_value: str) -> str:
    normalized = os.path.normpath(path_value)
    if os.path.isabs(normalized):
        return normalized
    return os.path.normpath(os.path.join(UPLOAD_DIR, normalized))


def _copy_tag_if_present(source_ds: Dataset, target_ds: Dataset, tag_name: str) -> None:
    if hasattr(source_ds, tag_name):
        value = getattr(source_ds, tag_name)
        if value is not None and value != "":
            setattr(target_ds, tag_name, value)


def _build_derived_series_number(source_ds: Dataset) -> int:
    raw_series_number = getattr(source_ds, "SeriesNumber", None)
    try:
        base_number = int(str(raw_series_number))
    except Exception:
        base_number = 0
    return min(base_number + 900, 9999)


def _read_mp4_as_grayscale_stack(mp4_path: str) -> np.ndarray:
    cap = cv2.VideoCapture(mp4_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open MP4 file: {mp4_path}")

    frames = []
    try:
        while True:
            ok, frame_bgr = cap.read()
            if not ok:
                break
            gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
            frames.append(gray)
    finally:
        cap.release()

    if not frames:
        raise RuntimeError(f"No frames decoded from MP4 file: {mp4_path}")

    return np.stack(frames, axis=0).astype(np.uint8)


def publish_mp4_as_derived_dicom(
    *,
    source_dicom_path: str,
    mp4_path: str,
    study_uid: str,
    series_label: str,
) -> Optional[Dict[str, Any]]:
    """
    Convert a generated MP4 artifact into a single multi-frame derived DICOM instance,
    upload it to Orthanc, and return upload metadata.

    Returns None if conversion/upload fails (non-fatal for pipeline flow).
    """
    try:
        if not source_dicom_path or not os.path.exists(source_dicom_path):
            logger.warning("[DERIVED_DICOM] Source DICOM missing, skip derived upload: %s", source_dicom_path)
            return None

        resolved_mp4_path = _resolve_path(mp4_path)
        if not os.path.exists(resolved_mp4_path):
            logger.warning("[DERIVED_DICOM] MP4 artifact missing, skip derived upload: %s", resolved_mp4_path)
            return None

        source_ds = pydicom.dcmread(source_dicom_path, stop_before_pixels=True, force=True)
        pixel_stack = _read_mp4_as_grayscale_stack(resolved_mp4_path)

        num_frames, rows, cols = pixel_stack.shape
        now = datetime.now(timezone.utc)

        series_instance_uid = generate_uid()
        sop_instance_uid = generate_uid()

        output_dir = os.path.join(UPLOAD_DIR, "ai_derived_dicom_videos", study_uid)
        os.makedirs(output_dir, exist_ok=True)
        output_dicom_path = os.path.join(output_dir, f"{series_instance_uid}.dcm")

        file_meta = FileMetaDataset()
        file_meta.FileMetaInformationVersion = b"\x00\x01"
        file_meta.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
        file_meta.MediaStorageSOPInstanceUID = sop_instance_uid
        file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        file_meta.ImplementationClassUID = PYDICOM_IMPLEMENTATION_UID

        ds = FileDataset(
            output_dicom_path,
            {},
            file_meta=file_meta,
            preamble=b"\0" * 128,
        )
        ds.is_little_endian = True
        ds.is_implicit_VR = False

        for tag_name in (
            "PatientName",
            "PatientID",
            "PatientBirthDate",
            "PatientSex",
            "StudyID",
            "AccessionNumber",
            "StudyDate",
            "StudyTime",
            "ReferringPhysicianName",
            "FrameOfReferenceUID",
        ):
            _copy_tag_if_present(source_ds, ds, tag_name)

        source_study_uid = str(getattr(source_ds, "StudyInstanceUID", "") or "").strip()
        ds.StudyInstanceUID = source_study_uid or study_uid or generate_uid()

        ds.SeriesInstanceUID = series_instance_uid
        ds.SOPClassUID = SecondaryCaptureImageStorage
        ds.SOPInstanceUID = sop_instance_uid
        ds.Modality = str(getattr(source_ds, "Modality", "US") or "US")
        ds.SeriesNumber = _build_derived_series_number(source_ds)
        ds.InstanceNumber = 1
        ds.SeriesDescription = f"{DERIVED_SERIES_PREFIX} | {series_label}"
        ds.ImageType = ["DERIVED", "SECONDARY", "AI_SEGMENTATION"]
        ds.ConversionType = "WSD"
        ds.BurnedInAnnotation = "NO"

        date_str = now.strftime("%Y%m%d")
        time_str = now.strftime("%H%M%S.%f")
        ds.SeriesDate = date_str
        ds.SeriesTime = time_str
        ds.ContentDate = date_str
        ds.ContentTime = time_str
        ds.AcquisitionDate = date_str
        ds.AcquisitionTime = time_str

        ds.Manufacturer = "Horalix"
        ds.ManufacturerModelName = "AI Segmentation Pipeline"
        ds.SoftwareVersions = "1.0"

        ds.NumberOfFrames = str(num_frames)
        ds.Rows = int(rows)
        ds.Columns = int(cols)
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.BitsAllocated = 8
        ds.BitsStored = 8
        ds.HighBit = 7
        ds.PixelRepresentation = 0
        ds.LossyImageCompression = "00"
        ds.PixelData = pixel_stack.tobytes()

        ds.save_as(output_dicom_path, write_like_original=False)

        upload_response = send_dicom_to_orthanc(output_dicom_path)
        relative_dicom_path = os.path.relpath(output_dicom_path, start=UPLOAD_DIR).replace("\\", "/")

        result = {
            "local_dicom_path": output_dicom_path,
            "relative_dicom_path": relative_dicom_path,
            "sop_instance_uid": sop_instance_uid,
            "series_instance_uid": series_instance_uid,
            "series_description": ds.SeriesDescription,
            "orthanc_instance_id": upload_response.get("ID"),
            "orthanc_series_id": upload_response.get("ParentSeries"),
            "orthanc_study_id": upload_response.get("ParentStudy"),
            "orthanc_status": upload_response.get("Status"),
        }

        logger.info(
            "[DERIVED_DICOM] Uploaded derived DICOM for study=%s series=%s instance=%s",
            study_uid,
            result["orthanc_series_id"],
            result["orthanc_instance_id"],
        )
        return result

    except Exception as err:
        logger.warning("[DERIVED_DICOM] Failed to publish derived DICOM: %s", err)
        return None
