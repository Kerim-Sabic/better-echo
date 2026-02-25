from pathlib import Path

from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from app.helpers.doppler_tags import inspect_doppler_tags


def _write_test_dicom(
    path: Path,
    *,
    with_region: bool = True,
    with_reference_line: bool = True,
    with_delta_x: bool = True,
    with_delta_y: bool = True,
    y0: int = 342,
    modality: str = "US",
    series_description: str = "PW Doppler",
    protocol_name: str = "Doppler",
    region_spatial_format: int = 3,
    region_data_type: int = 3,
) -> None:
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = generate_uid()
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.ImplementationClassUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = FileDataset(str(path), {}, file_meta=file_meta, preamble=b"\0" * 128)
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    ds.SOPClassUID = file_meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.Modality = modality
    ds.SeriesDescription = series_description
    ds.ProtocolName = protocol_name
    ds.PhotometricInterpretation = "RGB"

    if with_region:
        region = Dataset()
        region.add_new((0x0018, 0x6012), "US", region_spatial_format)  # region spatial format
        region.add_new((0x0018, 0x6014), "US", region_data_type)        # region data type
        region.add_new((0x0018, 0x6018), "UL", 8)      # x0
        region.add_new((0x0018, 0x601A), "UL", y0)     # y0
        region.add_new((0x0018, 0x601C), "UL", 1000)   # x1
        region.add_new((0x0018, 0x601E), "UL", 760)    # y1
        if with_delta_x:
            region.add_new((0x0018, 0x602C), "FD", 0.02)   # physical delta x
        if with_delta_y:
            region.add_new((0x0018, 0x602E), "FD", 0.03)   # physical delta y
        if with_reference_line:
            region.add_new((0x0018, 0x6022), "US", 190)    # baseline
        ds.add_new((0x0018, 0x6011), "SQ", Sequence([region]))

    ds.save_as(str(path), write_like_original=False)


def test_inspect_doppler_tags_accepts_valid_candidate(tmp_path):
    dicom_path = tmp_path / "valid_doppler.dcm"
    _write_test_dicom(dicom_path)

    report = inspect_doppler_tags(str(dicom_path))

    assert report["ok"] is True
    assert report["is_doppler_candidate"] is True
    assert report["reason_code"] == "TAGS_PRESENT"
    assert report["details"]["doppler_region"]["y0"] == 342
    assert report["details"]["doppler_region"]["region_spatial_format"] == 3
    assert report["details"]["doppler_region"]["region_data_type"] == 3
    assert report["details"]["spectral_subtype"] == "pw"


def test_inspect_doppler_tags_fails_when_region_missing(tmp_path):
    dicom_path = tmp_path / "no_region.dcm"
    _write_test_dicom(dicom_path, with_region=False)

    report = inspect_doppler_tags(str(dicom_path))

    assert report["ok"] is True
    assert report["is_doppler_candidate"] is False
    assert report["reason_code"] == "MISSING_ULTRASOUND_REGION"


def test_inspect_doppler_tags_rejects_non_spectral_region(tmp_path):
    dicom_path = tmp_path / "non_spectral.dcm"
    _write_test_dicom(dicom_path, region_spatial_format=1, region_data_type=1)

    report = inspect_doppler_tags(str(dicom_path))

    assert report["ok"] is True
    assert report["is_doppler_candidate"] is False
    assert report["reason_code"] == "NO_SPECTRAL_REGION"


def test_inspect_doppler_tags_accepts_cw_region(tmp_path):
    dicom_path = tmp_path / "cw_spectral.dcm"
    _write_test_dicom(dicom_path, region_spatial_format=3, region_data_type=4)

    report = inspect_doppler_tags(str(dicom_path))

    assert report["ok"] is True
    assert report["is_doppler_candidate"] is True
    assert report["details"]["spectral_subtype"] == "cw"


def test_inspect_doppler_tags_reports_missing_reference_line_as_warning(tmp_path):
    dicom_path = tmp_path / "missing_reference_line_warning.dcm"
    _write_test_dicom(dicom_path, with_reference_line=False)

    report = inspect_doppler_tags(str(dicom_path))

    assert report["ok"] is True
    assert report["is_doppler_candidate"] is True
    assert report["reason_code"] == "TAGS_PRESENT"
    assert "MISSING_REFERENCE_LINE" in report["details"]["warnings"]


def test_inspect_doppler_tags_reports_missing_delta_x_as_warning(tmp_path):
    dicom_path = tmp_path / "missing_delta_x_warning.dcm"
    _write_test_dicom(dicom_path, with_delta_x=False)

    report = inspect_doppler_tags(str(dicom_path))

    assert report["ok"] is True
    assert report["is_doppler_candidate"] is True
    assert report["reason_code"] == "TAGS_PRESENT"
    assert "MISSING_PHYSICAL_DELTA_X" in report["details"]["warnings"]
