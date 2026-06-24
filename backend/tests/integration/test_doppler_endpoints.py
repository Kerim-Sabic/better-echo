from pathlib import Path
from typing import Generator
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from app.api.inference.infer_spectral_measurements_api import router as doppler_router
from app.core.artifacts import (
    DOPPLER_MEASUREMENT_OVERLAY_KIND,
    DOPPLER_MEASUREMENT_OVERLAY_TYPE,
    SPECTRAL_MEASUREMENTS_UPLOAD_DIRNAME,
    spectral_measurements_result_type,
)
from app.database.db import get_db
from app.database_models.derived_results import DerivedResult
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.database_models.studies import Study
import app.services.inference.spectral_measurements.service as doppler_service


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


def _fake_doppler_prediction(
    *,
    model_weights: str,
    metric_value: float,
    low_confidence: bool = False,
    two_point: bool = False,
) -> dict:
    points = [
        {
            "id": "p0",
            "x": 320,
            "y": 260,
            "confidence": 0.001 if low_confidence else 0.91,
        }
    ]
    segments = []
    if two_point:
        points.append({"id": "p1", "x": 410, "y": 300, "confidence": 0.92})
        segments.append({"from": "p0", "to": "p1", "role": "measurement_line"})

    return {
        "model_weights": model_weights,
        "metric_name": "mv_e_over_a" if two_point else model_weights,
        "metric_value": metric_value,
        "units": "ratio" if two_point else "cm/s",
        "frame_width": 1000,
        "frame_height": 760,
        "selected_frame_index": 0,
        "points": points,
        "segments": segments,
        "reference_line": {
            "y": 532,
            "relative_y": 190,
            "role": "doppler_baseline",
        },
        "doppler_region": {
            "x0": 8,
            "y0": 342,
            "x1": 1000,
            "y1": 760,
            "reference_line": 190,
            "physical_delta_x": 0.02,
            "physical_delta_y": 0.03,
            "spectral_subtype": "pw",
        },
        "frame_selection": {
            "selection_mode": "single_frame",
            "num_frames": 1,
            "selected_frame_index": 0,
        },
        "geometry_type": "point_line" if two_point else "point_marker",
        "quality": {
            "confidence_score": 0.001 if low_confidence else 0.91,
            "confidence_threshold": 0.05,
            "low_confidence": low_confidence,
            "warnings": ["low_confidence"] if low_confidence else [],
        },
        "metadata": {
            "low_confidence": low_confidence,
            "confidence_score": 0.001 if low_confidence else 0.91,
        },
    }


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
    doppler_root = upload_root / SPECTRAL_MEASUREMENTS_UPLOAD_DIRNAME
    upload_root.mkdir(parents=True, exist_ok=True)
    doppler_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(doppler_service, "UPLOADS_ROOT", str(upload_root))
    monkeypatch.setattr(doppler_service, "DOPPLER_UPLOAD_ROOT", str(doppler_root))

    dicom_path = tmp_path / "doppler_infer.dcm"
    _write_test_dicom(dicom_path)
    sop_uid = _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(dicom_path),
        instance_number="1",
    )

    monkeypatch.setattr(
        doppler_service,
        "run_doppler_inference",
        lambda **kwargs: _fake_doppler_prediction(
            model_weights=kwargs["model_weights"],
            metric_value=321.12,
        ),
    )

    app = _create_test_app(db_session_factory)
    client = TestClient(app)
    response = client.post(f"/api/infer/measurements/doppler?sop_instance_uid={sop_uid}&model_weights=lvotvmax")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["overlay_type"] == DOPPLER_MEASUREMENT_OVERLAY_TYPE
    assert body["overlay_key"] == "lvotvmax"
    assert body["kind"] == DOPPLER_MEASUREMENT_OVERLAY_KIND
    assert body["has_overlay"] is True
    assert body["metric_name"] == "lvotvmax"
    assert body["metric_value"] == 321.12
    assert body["output_file_image"] is None
    assert body["low_confidence"] is False

    db = db_session_factory()
    try:
        instance = db.query(Instance).filter(Instance.sop_instance_uid == sop_uid).first()
        row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.instance_id == instance.id,
                DerivedResult.type == spectral_measurements_result_type("lvotvmax"),
            )
            .order_by(DerivedResult.id.desc())
            .first()
        )
        assert row is not None
        assert row.value_json["kind"] == DOPPLER_MEASUREMENT_OVERLAY_KIND
        assert row.value_json["overlay_key"] == "lvotvmax"
        assert row.value_json["selected_frame_index"] == 0
        assert row.value_json["geometry_type"] == "point_marker"
        assert len(row.value_json["points"]) == 1
        assert row.value_json["segments"] == []
        assert row.value_json["measurement"]["name"] == "lvotvmax"
        assert row.value_json["measurement"]["value"] == 321.12
        assert row.value_json["measurement"]["units"] == "cm/s"
        assert row.value_json["reference_line"] == {
            "y": 532,
            "relative_y": 190,
            "role": "doppler_baseline",
        }
        assert row.value_json["doppler_region"]["reference_line"] == 190
        assert row.value_json["quality"]["confidence_score"] == 0.91
        assert row.value_json["quality"]["low_confidence"] is False
        assert row.value_json["metadata"]["confidence_score"] == 0.91
        assert not list(doppler_root.rglob("*.jpg"))
    finally:
        db.close()


def test_doppler_inference_endpoint_persists_two_point_segment(
    db_session_factory,
    seeded_study,
    tmp_path,
    monkeypatch,
):
    dicom_path = tmp_path / "doppler_two_point.dcm"
    _write_test_dicom(dicom_path)
    sop_uid = _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(dicom_path),
        instance_number="1",
    )

    monkeypatch.setattr(
        doppler_service,
        "run_doppler_inference",
        lambda **kwargs: _fake_doppler_prediction(
            model_weights=kwargs["model_weights"],
            metric_value=1.45,
            two_point=True,
        ),
    )

    app = _create_test_app(db_session_factory)
    client = TestClient(app)
    response = client.post(
        f"/api/infer/measurements/doppler?sop_instance_uid={sop_uid}&model_weights=mvpeak_2c"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["overlay_key"] == "mvpeak_2c"
    assert body["output_file_image"] is None

    db = db_session_factory()
    try:
        instance = db.query(Instance).filter(Instance.sop_instance_uid == sop_uid).first()
        row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.instance_id == instance.id,
                DerivedResult.type == spectral_measurements_result_type("mvpeak_2c"),
            )
            .order_by(DerivedResult.id.desc())
            .first()
        )
        assert row is not None
        assert row.value_json["geometry_type"] == "point_line"
        assert len(row.value_json["points"]) == 2
        assert len(row.value_json["segments"]) == 1
        assert row.value_json["measurement"]["name"] == "mv_e_over_a"
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
    doppler_root = upload_root / SPECTRAL_MEASUREMENTS_UPLOAD_DIRNAME
    upload_root.mkdir(parents=True, exist_ok=True)
    doppler_root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(doppler_service, "UPLOADS_ROOT", str(upload_root))
    monkeypatch.setattr(doppler_service, "DOPPLER_UPLOAD_ROOT", str(doppler_root))

    dicom_path = tmp_path / "doppler_infer_low_conf.dcm"
    _write_test_dicom(dicom_path, region_spatial_format=3, region_data_type=3)  # pw
    sop_uid = _insert_instance_for_study(
        db_session_factory=db_session_factory,
        study_id=seeded_study["study_id"],
        file_path=str(dicom_path),
        instance_number="1",
    )

    monkeypatch.setattr(
        doppler_service,
        "run_doppler_inference",
        lambda **kwargs: _fake_doppler_prediction(
            model_weights=kwargs["model_weights"],
            metric_value=12.34,
            low_confidence=True,
        ),
    )

    app = _create_test_app(db_session_factory)
    client = TestClient(app)
    response = client.post(f"/api/infer/measurements/doppler?sop_instance_uid={sop_uid}&model_weights=lvotvmax")

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["low_confidence"] is True
    assert body["message"] == "Doppler measurement completed with low confidence"
    assert body["output_file_image"] is None

    db = db_session_factory()
    try:
        instance = db.query(Instance).filter(Instance.sop_instance_uid == sop_uid).first()
        row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.instance_id == instance.id,
                DerivedResult.type == spectral_measurements_result_type("lvotvmax"),
            )
            .order_by(DerivedResult.id.desc())
            .first()
        )
        assert row is not None
        assert row.value_json["quality"]["low_confidence"] is True
        assert row.value_json["quality"]["warnings"] == ["low_confidence"]
        assert row.value_json["metadata"]["low_confidence"] is True
        assert row.value_json["metadata"]["confidence_score"] == 0.001
        assert not list(doppler_root.rglob("*.jpg"))
    finally:
        db.close()

