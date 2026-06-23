import hashlib
from pathlib import Path
from uuid import uuid4

import numpy as np
import pytest
from fastapi import HTTPException

import app.services.inference.linear_measurements.service as svc
from app.core.artifacts import (
    LINEAR_MEASUREMENT_OVERLAY_KIND,
    LINEAR_MEASUREMENT_OVERLAY_TYPE,
    LINEAR_MEASUREMENTS_UPLOAD_DIRNAME,
    UPLOAD_DIR,
    linear_measurements_result_type,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.services.inference.linear_measurements.geometry import (
    DicomScale,
    LinearMeasurementInputs,
)


def _seed_instance(db, seeded_study, tmp_path, *, file_exists=True):
    suffix = uuid4().hex[:8]
    dcm_path = tmp_path / f"{suffix}.dcm"
    if file_exists:
        dcm_path.write_bytes(b"DUMMY-DICOM-BYTES-DO-NOT-MODIFY")

    series = Series(
        series_uid=f"series-{suffix}",
        modality="US",
        description="A4C",
        series_orthanc_id=f"orthanc-series-{suffix}",
        study_id=seeded_study["study_id"],
    )
    instance = Instance(
        sop_instance_uid=f"sop-{suffix}",
        file_path=str(dcm_path),
        instance_orthanc_id=f"orthanc-instance-{suffix}",
        instance_number="3",
        predicted_view="A4C",
        predicted_view_confidence=0.99,
        series=series,
    )
    db.add_all([series, instance])
    db.commit()
    db.refresh(instance)
    return instance, str(dcm_path)


def _file_hash(path):
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def test_structured_linear_measurement_creates_no_media_and_persists_overlay(
    db_session_factory,
    seeded_study,
    monkeypatch,
    tmp_path,
):
    db = db_session_factory()
    try:
        instance, dcm_path = _seed_instance(db, seeded_study, tmp_path)
        hash_before = _file_hash(dcm_path)

        source_frames = [np.zeros((60, 80, 3), np.uint8) for _ in range(3)]
        model_frames = [np.zeros((480, 640, 3), np.uint8) for _ in range(3)]
        inputs = LinearMeasurementInputs(
            source_frames_bgr=source_frames,
            model_frames_bgr=model_frames,
            fps=30.0,
            frame_width=80,
            frame_height=60,
            dicom_scale=DicomScale(
                conv_x_cm=0.1,
                conv_y_cm=0.2,
                ratio_w=80 / 640,
                ratio_h=60 / 480,
            ),
        )
        monkeypatch.setattr(svc, "load_measurement_inputs", lambda _path: inputs)
        monkeypatch.setattr(
            svc,
            "predict_linear_measurement_points",
            lambda **_: np.array(
                [
                    [[80.0, 80.0], [160.0, 80.0]],
                    [[90.0, 80.0], [170.0, 80.0]],
                    [[100.0, 80.0], [180.0, 80.0]],
                ],
                dtype=np.float32,
            ),
        )
        monkeypatch.setattr(svc, "unload_2d_models", lambda: None)

        result = svc.run_linear_measurements(
            sop_instance_uid=instance.sop_instance_uid,
            model_weights="rv_base",
            force=True,
            db=db,
            skip_orthanc_check=True,
        )

        assert result["overlay_type"] == LINEAR_MEASUREMENT_OVERLAY_TYPE
        assert result["overlay_key"] == "rv_base"
        assert result["kind"] == LINEAR_MEASUREMENT_OVERLAY_KIND
        assert result["has_overlay"] is True
        assert result["output_file_mp4"] is None
        assert result["min_length_cm"] == 1.0
        assert result["max_length_cm"] == 1.0

        row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.instance_id == instance.id,
                DerivedResult.type == linear_measurements_result_type("rv_base"),
            )
            .first()
        )
        assert row is not None
        assert row.status == ResultStatus.complete

        doc = row.value_json
        assert doc["overlay_type"] == LINEAR_MEASUREMENT_OVERLAY_TYPE
        assert doc["overlay_key"] == "rv_base"
        assert doc["kind"] == LINEAR_MEASUREMENT_OVERLAY_KIND
        assert doc["sop_instance_uid"] == instance.sop_instance_uid
        assert doc["frame_count"] == 3
        assert doc["frame_width"] == 80
        assert doc["frame_height"] == 60
        assert doc["coordinate_space"] == "source_pixel"
        assert doc["geometry_type"] == "point_line"
        assert doc["quality"]["frames_with_geometry"] == 3
        assert doc["quality"]["min_length_cm"] == 1.0
        assert doc["quality"]["max_length_cm"] == 1.0
        assert len(doc["frames"]) == 3
        assert all(len(frame["points"]) == 2 for frame in doc["frames"])
        assert all(len(frame["segments"]) == 1 for frame in doc["frames"])
        assert all(frame["measurement"]["units"] == "cm" for frame in doc["frames"])
        assert doc["frames"][0]["points"] == [
            {"id": "p0", "x": 10.0, "y": 10.0, "confidence": None},
            {"id": "p1", "x": 20.0, "y": 10.0, "confidence": None},
        ]
        assert doc["frames"][0]["segments"] == [
            {"from": "p0", "to": "p1", "role": "measurement_line"}
        ]
        assert doc["frames"][0]["measurement"] == {
            "name": "rv_base",
            "value": 1.0,
            "units": "cm",
            "length_px": 10.0,
        }

        study_media_dir = (
            Path(UPLOAD_DIR)
            / LINEAR_MEASUREMENTS_UPLOAD_DIRNAME
            / seeded_study["study_uid"]
        )
        assert not list(study_media_dir.rglob("*.mp4"))
        assert not list(study_media_dir.rglob("*.csv"))
        assert _file_hash(dcm_path) == hash_before
    finally:
        db.close()


def test_linear_measurement_rejects_invalid_weight(db_session_factory):
    db = db_session_factory()
    try:
        with pytest.raises(HTTPException) as exc:
            svc.run_linear_measurements(
                sop_instance_uid="sop-1",
                model_weights="not_a_weight",
                force=True,
                db=db,
                skip_orthanc_check=True,
            )
        assert exc.value.status_code == 400
    finally:
        db.close()


def test_linear_measurement_rejects_missing_local_file(
    db_session_factory,
    seeded_study,
    tmp_path,
):
    db = db_session_factory()
    try:
        instance, _ = _seed_instance(db, seeded_study, tmp_path, file_exists=False)

        with pytest.raises(HTTPException) as exc:
            svc.run_linear_measurements(
                sop_instance_uid=instance.sop_instance_uid,
                model_weights="rv_base",
                force=True,
                db=db,
                skip_orthanc_check=True,
            )
        assert exc.value.status_code == 400
    finally:
        db.close()
