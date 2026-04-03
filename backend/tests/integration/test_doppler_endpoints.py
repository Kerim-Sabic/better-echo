from pathlib import Path
from typing import Generator
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from app.api.inference import infer_spectral_measurements_api as doppler_api
from app.api.inference.infer_spectral_measurements_api import router as doppler_router
from app.database.db import get_db
from app.database_models.derived_results import DerivedResult
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.database_models.studies import Study


def _write_test_dicom(
    path: Path,
    *,
    with_region: bool = True,
    with_reference_line: bool = True,
    with_delta_x: bool = True,
    with_delta_y: bool = True,
    y0: int = 342,
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
    ds.Modality = "US"
    ds.SeriesDescription = "PW Doppler"
    ds.ProtocolName = "Doppler"
    ds.PhotometricInterpretation = "RGB"

    if with_region:
        region = Dataset()
        region.add_new((0x0018, 0x6012), "US", region_spatial_format)
        region.add_new((0x0018, 0x6014), "US", region_data_type)
        region.add_new((0x0018, 0x6018), "UL", 8)
        region.add_new((0x0018, 0x601A), "UL", y0)
        region.add_new((0x0018, 0x601C), "UL", 1000)
        region.add_new((0x0018, 0x601E), "UL", 760)
        if with_delta_x:
            region.add_new((0x0018, 0x602C), "FD", 0.02)
        if with_delta_y:
            region.add_new((0x0018, 0x602E), "FD", 0.03)
        if with_reference_line:
            region.add_new((0x0018, 0x6022), "US", 190)
        ds.add_new((0x0018, 0x6011), "SQ", Sequence([region]))

    ds.save_as(str(path), write_like_original=False)


def _insert_instance_for_study(
    *,
    db_session_factory,
    study_id: int,
    file_path: str,
    instance_number: str,
) -> str:
    suffix = uuid4().hex[:8]
    db = db_session_factory()
    try:
        study = db.query(Study).filter(Study.id == study_id).first()
        if not study:
            raise RuntimeError("Study fixture missing.")
        series = Series(
            series_uid=f"series-{suffix}",
            modality="US",
            description="Doppler Series",
            series_orthanc_id=f"series-orth-{suffix}",
            study_id=study.id,
        )
        db.add(series)
        db.flush()
        instance = Instance(
            sop_instance_uid=f"sop-{suffix}",
            file_path=file_path,
            instance_orthanc_id=f"inst-orth-{suffix}",
            instance_number=instance_number,
            series_id=series.id,
        )
        db.add(instance)
        db.commit()
        return instance.sop_instance_uid
    finally:
        db.close()


def _create_test_app(db_session_factory) -> FastAPI:
    app = FastAPI()
    app.include_router(doppler_router, prefix="/api")

    def override_get_db() -> Generator:
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return app


def test_doppler_tag_check_endpoint_returns_candidate(db_session_factory, seeded_study, tmp_path):
    dicom_path = tmp_path / "doppler_candidate.dcm"
    _write_test_dicom(dicom_path)
    sop_uid = _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(dicom_path),
        instance_number="1",
    )

    app = _create_test_app(db_session_factory)
    client = TestClient(app)
    response = client.get(f"/api/infer/measurements/doppler/tag-check?sop_instance_uid={sop_uid}")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["is_doppler_candidate"] is True
    assert body["reason_code"] == "TAGS_PRESENT"


def test_doppler_tag_check_rejects_non_spectral_instance(db_session_factory, seeded_study, tmp_path):
    dicom_path = tmp_path / "non_spectral.dcm"
    _write_test_dicom(dicom_path, region_spatial_format=1, region_data_type=1)
    sop_uid = _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(dicom_path),
        instance_number="1",
    )

    app = _create_test_app(db_session_factory)
    client = TestClient(app)
    response = client.get(f"/api/infer/measurements/doppler/tag-check?sop_instance_uid={sop_uid}")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["is_doppler_candidate"] is False
    assert body["reason_code"] == "NO_SPECTRAL_REGION"


def test_doppler_tag_audit_counts_candidates(db_session_factory, seeded_study, tmp_path):
    valid_dicom = tmp_path / "valid_for_audit.dcm"
    invalid_dicom = tmp_path / "invalid_for_audit.dcm"
    _write_test_dicom(valid_dicom)
    _write_test_dicom(invalid_dicom, with_region=False)

    _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(valid_dicom),
        instance_number="1",
    )
    _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(invalid_dicom),
        instance_number="2",
    )

    app = _create_test_app(db_session_factory)
    client = TestClient(app)
    response = client.get(f"/api/infer/measurements/doppler/tag-audit/{seeded_study['study_uid']}")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["total_instances"] == 2
    assert body["doppler_candidates"] == 1
    assert len(body["items"]) == 2


def test_doppler_inference_endpoint_runs_and_persists(db_session_factory, seeded_study, tmp_path, monkeypatch):
    upload_root = tmp_path / "uploads"
    doppler_root = upload_root / "measurement_spectral"
    upload_root.mkdir(parents=True, exist_ok=True)
    doppler_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(doppler_api, "UPLOADS_ROOT", str(upload_root))
    monkeypatch.setattr(doppler_api, "DOPPLER_UPLOAD_ROOT", str(doppler_root))

    dicom_path = tmp_path / "doppler_infer.dcm"
    _write_test_dicom(dicom_path)
    sop_uid = _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(dicom_path),
        instance_number="1",
    )

    output_image_abs = upload_root / "measurement_spectral" / "artifact.jpg"
    output_image_abs.parent.mkdir(parents=True, exist_ok=True)
    output_image_abs.write_bytes(b"test-image")

    def _fake_run_doppler_inference(*, model_weights: str, input_path: str, output_dir: str, region_override=None):
        return {
            "model_weights": model_weights,
            "metric_name": "lvotvmax",
            "metric_value": 321.12,
            "units": "cm/s",
            "output_file_image": str(output_image_abs),
            "metadata": {"fake": True, "input_path": input_path, "output_dir": output_dir},
        }

    monkeypatch.setattr(doppler_api, "run_doppler_inference", _fake_run_doppler_inference)

    app = _create_test_app(db_session_factory)
    client = TestClient(app)
    response = client.post(f"/api/infer/measurements/doppler?sop_instance_uid={sop_uid}&model_weights=lvotvmax")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["metric_name"] == "lvotvmax"
    assert body["metric_value"] == 321.12
    assert body["output_file_image"] == "measurement_spectral/artifact.jpg"
    assert body["low_confidence"] is False

    db = db_session_factory()
    try:
        instance = db.query(Instance).filter(Instance.sop_instance_uid == sop_uid).first()
        row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.instance_id == instance.id,
                DerivedResult.type == "EchoNetMeasurementsDoppler_lvotvmax",
            )
            .order_by(DerivedResult.id.desc())
            .first()
        )
        assert row is not None
        assert row.value_json["metric_name"] == "lvotvmax"
    finally:
        db.close()


def test_doppler_inference_endpoint_rejects_non_spectral_instance(db_session_factory, seeded_study, tmp_path):
    dicom_path = tmp_path / "infer_non_spectral.dcm"
    _write_test_dicom(dicom_path, region_spatial_format=1, region_data_type=1)
    sop_uid = _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(dicom_path),
        instance_number="1",
    )

    app = _create_test_app(db_session_factory)
    client = TestClient(app)
    response = client.post(f"/api/infer/measurements/doppler?sop_instance_uid={sop_uid}&model_weights=trvmax")

    assert response.status_code == 400
    assert "NO_SPECTRAL_REGION" in response.json()["detail"]


def test_doppler_inference_endpoint_requires_delta_x_for_two_point_model(db_session_factory, seeded_study, tmp_path):
    dicom_path = tmp_path / "missing_delta_x_two_point.dcm"
    _write_test_dicom(dicom_path, with_delta_x=False)
    sop_uid = _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(dicom_path),
        instance_number="1",
    )

    app = _create_test_app(db_session_factory)
    client = TestClient(app)
    response = client.post(f"/api/infer/measurements/doppler?sop_instance_uid={sop_uid}&model_weights=mvpeak_2c")

    assert response.status_code == 400
    assert "physical delta x" in response.json()["detail"].lower()


def test_doppler_inference_endpoint_rejects_subtype_weight_mismatch(db_session_factory, seeded_study, tmp_path):
    dicom_path = tmp_path / "pw_but_cw_weight.dcm"
    _write_test_dicom(dicom_path, region_spatial_format=3, region_data_type=3)  # pw
    sop_uid = _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(dicom_path),
        instance_number="1",
    )

    app = _create_test_app(db_session_factory)
    client = TestClient(app)
    response = client.post(f"/api/infer/measurements/doppler?sop_instance_uid={sop_uid}&model_weights=trvmax")

    assert response.status_code == 400
    assert "not compatible with spectral subtype 'pw'" in response.json()["detail"]


def test_doppler_inference_endpoint_sets_low_confidence_flag(db_session_factory, seeded_study, tmp_path, monkeypatch):
    upload_root = tmp_path / "uploads"
    doppler_root = upload_root / "measurement_spectral"
    upload_root.mkdir(parents=True, exist_ok=True)
    doppler_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(doppler_api, "UPLOADS_ROOT", str(upload_root))
    monkeypatch.setattr(doppler_api, "DOPPLER_UPLOAD_ROOT", str(doppler_root))

    dicom_path = tmp_path / "doppler_infer_low_conf.dcm"
    _write_test_dicom(dicom_path, region_spatial_format=3, region_data_type=3)  # pw
    sop_uid = _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(dicom_path),
        instance_number="1",
    )

    output_image_abs = upload_root / "measurement_spectral" / "artifact_low.jpg"
    output_image_abs.parent.mkdir(parents=True, exist_ok=True)
    output_image_abs.write_bytes(b"test-image")

    def _fake_run_doppler_inference(*, model_weights: str, input_path: str, output_dir: str, region_override=None):
        return {
            "model_weights": model_weights,
            "metric_name": "lvotvmax",
            "metric_value": 12.34,
            "units": "cm/s",
            "output_file_image": str(output_image_abs),
            "metadata": {"low_confidence": True, "input_path": input_path, "output_dir": output_dir},
        }

    monkeypatch.setattr(doppler_api, "run_doppler_inference", _fake_run_doppler_inference)

    app = _create_test_app(db_session_factory)
    client = TestClient(app)
    response = client.post(f"/api/infer/measurements/doppler?sop_instance_uid={sop_uid}&model_weights=lvotvmax")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["low_confidence"] is True
    assert body["message"] == "Inference completed with low confidence"

