from pathlib import Path

import cv2
import numpy as np
import pydicom
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import (
    ExplicitVRLittleEndian,
    MultiFrameTrueColorSecondaryCaptureImageStorage,
    SecondaryCaptureImageStorage,
    generate_uid,
)

from app.services.upload_mp4_to_orthanc import upload_mp4_to_orthanc
from app.services.upload_mp4_to_orthanc.upload_mp4_to_orthanc import (
    publish_mp4_as_derived_dicom,
)


def _write_source_dicom(path: Path) -> None:
    file_meta = FileMetaDataset()
    file_meta.FileMetaInformationVersion = b"\x00\x01"
    file_meta.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = FileDataset(str(path), {}, file_meta=file_meta, preamble=b"\0" * 128)
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    ds.PatientID = "test-patient"
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.SOPClassUID = SecondaryCaptureImageStorage
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.Modality = "US"
    ds.SeriesNumber = 1
    ds.save_as(path, write_like_original=False)


def _write_color_mp4(path: Path) -> None:
    writer = cv2.VideoWriter(
        str(path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        1.0,
        (12, 8),
    )
    assert writer.isOpened()
    frame_bgr = np.zeros((8, 12, 3), dtype=np.uint8)
    frame_bgr[:, :4] = (0, 0, 255)
    frame_bgr[:, 4:8] = (0, 255, 0)
    frame_bgr[:, 8:] = (255, 0, 0)
    writer.write(frame_bgr)
    writer.release()


def test_publish_mp4_as_derived_dicom_preserves_rgb_pixels(tmp_path, monkeypatch):
    source_dicom = tmp_path / "source.dcm"
    mp4_path = tmp_path / "overlay.mp4"
    _write_source_dicom(source_dicom)
    _write_color_mp4(mp4_path)

    monkeypatch.setattr(upload_mp4_to_orthanc, "UPLOAD_DIR", str(tmp_path))
    monkeypatch.setattr(
        upload_mp4_to_orthanc,
        "send_dicom_to_orthanc",
        lambda _path: {
            "ID": "orthanc-instance",
            "ParentSeries": "orthanc-series",
            "ParentStudy": "orthanc-study",
            "Status": "Success",
        },
    )

    result = publish_mp4_as_derived_dicom(
        source_dicom_path=str(source_dicom),
        mp4_path=str(mp4_path),
        study_uid="study-uid",
        series_label="Color Overlay",
    )

    assert result["orthanc_instance_id"] == "orthanc-instance"
    assert result["relative_dicom_path"]
    ds = pydicom.dcmread(result["local_dicom_path"])

    assert ds.SOPClassUID == MultiFrameTrueColorSecondaryCaptureImageStorage
    assert ds.file_meta.MediaStorageSOPClassUID == MultiFrameTrueColorSecondaryCaptureImageStorage
    assert ds.SamplesPerPixel == 3
    assert ds.PhotometricInterpretation == "RGB"
    assert ds.PlanarConfiguration == 0

    pixels = ds.pixel_array
    assert pixels.shape[-1] == 3
    assert not np.array_equal(pixels[..., 0], pixels[..., 1])
    assert not np.array_equal(pixels[..., 1], pixels[..., 2])
