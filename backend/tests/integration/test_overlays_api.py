from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.artifacts import (
    DOPPLER_MEASUREMENT_OVERLAY_KIND,
    DOPPLER_MEASUREMENT_OVERLAY_TYPE,
    LINEAR_MEASUREMENT_OVERLAY_KIND,
    LINEAR_MEASUREMENT_OVERLAY_TYPE,
    LINEAR_MEASUREMENTS_MODEL_NAME,
    LV_SEGMENTATION_OVERLAY_KIND,
    LV_SEGMENTATION_OVERLAY_TYPE,
    MOTION_SEGMENTATION_MODEL_NAME,
    MOTION_SEGMENTATION_TYPE,
    SPECTRAL_MEASUREMENTS_MODEL_NAME,
    linear_measurements_result_type,
    spectral_measurements_result_type,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.instances import Instance
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet, PipelineArtifactSetState
from app.database_models.series import Series


def _seed_instance(db, seeded_study):
    suffix = uuid4().hex[:8]
    series = Series(
        series_uid=f"series-{suffix}",
        modality="US",
        description="A4C",
        series_orthanc_id=f"orthanc-series-{suffix}",
        study_id=seeded_study["study_id"],
    )
    instance = Instance(
        sop_instance_uid=f"sop-{suffix}",
        file_path=f"/tmp/{suffix}.dcm",
        instance_orthanc_id=f"orthanc-instance-{suffix}",
        instance_number="3",
        predicted_view="A4C",
        predicted_view_confidence=0.99,
        series=series,
    )
    db.add_all([series, instance])
    db.commit()
    db.refresh(instance)
    return instance


def _seed_artifact_set(db, seeded_study, state):
    artifact_set = PipelineArtifactSet(
        study_id=seeded_study["study_id"],
        state=state,
        input_revision=1,
    )
    db.add(artifact_set)
    db.commit()
    db.refresh(artifact_set)
    return artifact_set


def _overlay_document(instance):
    return {
        "schema_version": 1,
        "kind": LV_SEGMENTATION_OVERLAY_KIND,
        "sop_instance_uid": instance.sop_instance_uid,
        "instance_id": instance.id,
        "model_name": MOTION_SEGMENTATION_MODEL_NAME,
        "model_version": "v1",
        "frame_count": 2,
        "frame_width": 4,
        "frame_height": 3,
        "fps": 30.0,
        "mask_format": "rle",
        "mask_resolution": [4, 3],
        "frames": [
            {"rle": {"size": [3, 4], "counts": [12]}, "area_px": 0, "present": False},
            {"rle": {"size": [3, 4], "counts": [5, 2, 5]}, "area_px": 2, "present": True},
        ],
        "quality": {"frames_with_mask": 1, "mean_confidence": 0.8, "warnings": []},
        "generated_at": "2026-06-08T00:00:00Z",
    }


def _linear_overlay_document(instance, overlay_key="rv_base"):
    return {
        "schema_version": 1,
        "overlay_type": LINEAR_MEASUREMENT_OVERLAY_TYPE,
        "overlay_key": overlay_key,
        "kind": LINEAR_MEASUREMENT_OVERLAY_KIND,
        "sop_instance_uid": instance.sop_instance_uid,
        "instance_id": instance.id,
        "model_name": LINEAR_MEASUREMENTS_MODEL_NAME,
        "model_version": "v1",
        "frame_count": 2,
        "frame_width": 640,
        "frame_height": 480,
        "fps": 30.0,
        "coordinate_space": "source_pixel",
        "geometry_type": "point_line",
        "frames": [
            {
                "frame_index": 0,
                "present": True,
                "points": [{"id": "p0", "x": 10, "y": 20}, {"id": "p1", "x": 30, "y": 20}],
                "segments": [{"from": "p0", "to": "p1", "role": "measurement_line"}],
                "measurement": {"name": overlay_key, "value": 2.0, "units": "cm"},
            }
        ],
        "quality": {"frames_with_geometry": 1, "min_length_cm": 2.0, "max_length_cm": 2.0, "warnings": []},
        "generated_at": "2026-06-08T00:00:00Z",
    }


def _doppler_overlay_document(instance, overlay_key="lvotvmax"):
    return {
        "schema_version": 1,
        "overlay_type": DOPPLER_MEASUREMENT_OVERLAY_TYPE,
        "overlay_key": overlay_key,
        "kind": DOPPLER_MEASUREMENT_OVERLAY_KIND,
        "sop_instance_uid": instance.sop_instance_uid,
        "instance_id": instance.id,
        "model_name": SPECTRAL_MEASUREMENTS_MODEL_NAME,
        "model_version": "v1",
        "frame_count": 1,
        "source_frame_count": 1,
        "frame_width": 640,
        "frame_height": 480,
        "coordinate_space": "source_pixel",
        "geometry_type": "point_marker",
        "selected_frame_index": 0,
        "points": [{"id": "p0", "x": 220, "y": 260, "confidence": 0.91}],
        "segments": [],
        "reference_line": {"y": 190, "role": "doppler_baseline"},
        "measurement": {"name": overlay_key, "value": 102.4, "units": "cm/s"},
        "doppler_region": {"reference_line": 190},
        "frame_selection": {"selected_frame_index": 0},
        "quality": {"confidence_score": 0.91, "confidence_threshold": 0.01, "low_confidence": False, "warnings": []},
        "generated_at": "2026-06-08T00:00:00Z",
    }


def _seed_result_row(
    db,
    seeded_study,
    instance,
    *,
    result_type,
    model_name,
    value_json,
    artifact_set=None,
):
    row = DerivedResult(
        study_id=seeded_study["study_id"],
        instance_id=instance.id,
        artifact_set_id=artifact_set.id if artifact_set else None,
        type=result_type,
        model_name=model_name,
        model_version="v1",
        status=ResultStatus.complete,
        value_json=value_json,
    )
    db.add(row)
    db.commit()
    return row


def _seed_overlay_row(db, seeded_study, instance, *, value_json=None, artifact_set=None):
    document = _overlay_document(instance) if value_json is None else value_json
    return _seed_result_row(
        db,
        seeded_study,
        instance,
        result_type=MOTION_SEGMENTATION_TYPE,
        model_name=MOTION_SEGMENTATION_MODEL_NAME,
        value_json=document,
        artifact_set=artifact_set,
    )


def test_study_overlays_lists_structured_lv_metadata(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        instance = _seed_instance(db, seeded_study)
        sop_instance_uid = instance.sop_instance_uid
        active_set = _seed_artifact_set(db, seeded_study, PipelineArtifactSetState.active)
        _seed_overlay_row(db, seeded_study, instance, artifact_set=active_set)
    finally:
        db.close()

    response = TestClient(app).get(f"/api/studies/{seeded_study['study_uid']}/overlays")
    assert response.status_code == 200

    data = response.json()
    assert data["study_uid"] == seeded_study["study_uid"]
    assert len(data["overlays"]) == 1
    overlay = data["overlays"][0]
    assert overlay["sop_instance_uid"] == sop_instance_uid
    assert overlay["overlay_type"] == LV_SEGMENTATION_OVERLAY_TYPE
    assert overlay["kind"] == LV_SEGMENTATION_OVERLAY_KIND
    assert overlay["available"] is True
    assert overlay["status"] == "completed"
    assert overlay["frame_count"] == 2
    assert overlay["mean_confidence"] == 0.8
    assert overlay["payload_url"].endswith(
        f"/instances/{sop_instance_uid}/overlays/lv_segmentation/payload"
    )


def test_instance_overlays_returns_structured_lv_metadata(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        instance = _seed_instance(db, seeded_study)
        sop_instance_uid = instance.sop_instance_uid
        _seed_overlay_row(db, seeded_study, instance)
    finally:
        db.close()

    response = TestClient(app).get(f"/api/instances/{sop_instance_uid}/overlays")
    assert response.status_code == 200

    data = response.json()
    assert data["sop_instance_uid"] == sop_instance_uid
    assert len(data["overlays"]) == 1
    assert data["overlays"][0]["overlay_type"] == LV_SEGMENTATION_OVERLAY_TYPE
    assert data["overlays"][0]["kind"] == LV_SEGMENTATION_OVERLAY_KIND


def test_instance_overlay_payload_returns_exact_document(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        instance = _seed_instance(db, seeded_study)
        sop_instance_uid = instance.sop_instance_uid
        document = _overlay_document(instance)
        _seed_overlay_row(db, seeded_study, instance, value_json=document)
    finally:
        db.close()

    response = TestClient(app).get(
        f"/api/instances/{sop_instance_uid}/overlays/lv_segmentation/payload"
    )
    assert response.status_code == 200
    assert response.json() == document


def test_study_overlays_lists_multiple_measurement_overlays(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        instance = _seed_instance(db, seeded_study)
        sop_instance_uid = instance.sop_instance_uid
        _seed_result_row(
            db,
            seeded_study,
            instance,
            result_type=linear_measurements_result_type("rv_base"),
            model_name=LINEAR_MEASUREMENTS_MODEL_NAME,
            value_json=_linear_overlay_document(instance, "rv_base"),
        )
        _seed_result_row(
            db,
            seeded_study,
            instance,
            result_type=spectral_measurements_result_type("lvotvmax"),
            model_name=SPECTRAL_MEASUREMENTS_MODEL_NAME,
            value_json=_doppler_overlay_document(instance, "lvotvmax"),
        )
    finally:
        db.close()

    response = TestClient(app).get(f"/api/studies/{seeded_study['study_uid']}/overlays")
    assert response.status_code == 200

    overlays = response.json()["overlays"]
    assert len(overlays) == 2
    by_type = {overlay["overlay_type"]: overlay for overlay in overlays}
    linear = by_type[LINEAR_MEASUREMENT_OVERLAY_TYPE]
    doppler = by_type[DOPPLER_MEASUREMENT_OVERLAY_TYPE]

    assert linear["sop_instance_uid"] == sop_instance_uid
    assert linear["overlay_key"] == "rv_base"
    assert linear["geometry_type"] == "point_line"
    assert linear["measurement_name"] == "rv_base"
    assert linear["measurement_value"] == 2.0
    assert linear["measurement_units"] == "cm"
    assert linear["payload_url"].endswith(
        f"/instances/{sop_instance_uid}/overlays/linear_measurement/rv_base/payload"
    )

    assert doppler["overlay_key"] == "lvotvmax"
    assert doppler["geometry_type"] == "point_marker"
    assert doppler["measurement_name"] == "lvotvmax"
    assert doppler["measurement_value"] == 102.4
    assert doppler["measurement_units"] == "cm/s"
    assert doppler["payload_url"].endswith(
        f"/instances/{sop_instance_uid}/overlays/doppler_measurement/lvotvmax/payload"
    )


def test_measurement_overlay_payload_routes_return_exact_documents(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        instance = _seed_instance(db, seeded_study)
        sop_instance_uid = instance.sop_instance_uid
        linear_document = _linear_overlay_document(instance, "rv_base")
        doppler_document = _doppler_overlay_document(instance, "lvotvmax")
        _seed_result_row(
            db,
            seeded_study,
            instance,
            result_type=linear_measurements_result_type("rv_base"),
            model_name=LINEAR_MEASUREMENTS_MODEL_NAME,
            value_json=linear_document,
        )
        _seed_result_row(
            db,
            seeded_study,
            instance,
            result_type=spectral_measurements_result_type("lvotvmax"),
            model_name=SPECTRAL_MEASUREMENTS_MODEL_NAME,
            value_json=doppler_document,
        )
    finally:
        db.close()

    client = TestClient(app)
    linear_response = client.get(
        f"/api/instances/{sop_instance_uid}/overlays/linear_measurement/rv_base/payload"
    )
    doppler_response = client.get(
        f"/api/instances/{sop_instance_uid}/overlays/doppler_measurement/lvotvmax/payload"
    )

    assert linear_response.status_code == 200
    assert linear_response.json() == linear_document
    assert doppler_response.status_code == 200
    assert doppler_response.json() == doppler_document


def test_measurement_overlay_payload_404_for_unknown_key(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        instance = _seed_instance(db, seeded_study)
        sop_instance_uid = instance.sop_instance_uid
        _seed_result_row(
            db,
            seeded_study,
            instance,
            result_type=linear_measurements_result_type("rv_base"),
            model_name=LINEAR_MEASUREMENTS_MODEL_NAME,
            value_json=_linear_overlay_document(instance, "rv_base"),
        )
    finally:
        db.close()

    response = TestClient(app).get(
        f"/api/instances/{sop_instance_uid}/overlays/linear_measurement/not_real/payload"
    )
    assert response.status_code == 404


def test_overlay_payload_404_for_unknown_instance(app):
    response = TestClient(app).get("/api/instances/no-such-instance/overlays/lv_segmentation/payload")
    assert response.status_code == 404


def test_overlay_payload_404_for_unsupported_overlay_type(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        instance = _seed_instance(db, seeded_study)
        sop_instance_uid = instance.sop_instance_uid
        _seed_overlay_row(db, seeded_study, instance)
    finally:
        db.close()

    response = TestClient(app).get(f"/api/instances/{sop_instance_uid}/overlays/not-real/payload")
    assert response.status_code == 404


def test_legacy_motion_segmentation_row_is_not_available(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        instance = _seed_instance(db, seeded_study)
        sop_instance_uid = instance.sop_instance_uid
        _seed_overlay_row(
            db,
            seeded_study,
            instance,
            value_json={"outputfile": "motion_segmentation_files/study/instance.mp4"},
        )
    finally:
        db.close()

    client = TestClient(app)
    metadata_response = client.get(f"/api/instances/{sop_instance_uid}/overlays")
    assert metadata_response.status_code == 200
    overlay = metadata_response.json()["overlays"][0]
    assert overlay["available"] is False
    assert overlay["structured"] is False

    payload_response = client.get(
        f"/api/instances/{sop_instance_uid}/overlays/lv_segmentation/payload"
    )
    assert payload_response.status_code == 404


def test_legacy_measurement_rows_are_not_available(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        instance = _seed_instance(db, seeded_study)
        sop_instance_uid = instance.sop_instance_uid
        _seed_result_row(
            db,
            seeded_study,
            instance,
            result_type=linear_measurements_result_type("rv_base"),
            model_name=LINEAR_MEASUREMENTS_MODEL_NAME,
            value_json={"outputfile": "linear_measurements_files/study/rv_base.mp4"},
        )
        _seed_result_row(
            db,
            seeded_study,
            instance,
            result_type=spectral_measurements_result_type("lvotvmax"),
            model_name=SPECTRAL_MEASUREMENTS_MODEL_NAME,
            value_json={"outputfile": "spectral_measurements_files/study/lvotvmax.jpg"},
        )
    finally:
        db.close()

    client = TestClient(app)
    metadata_response = client.get(f"/api/instances/{sop_instance_uid}/overlays")
    assert metadata_response.status_code == 200
    overlays = metadata_response.json()["overlays"]
    assert len(overlays) == 2
    assert {overlay["overlay_key"] for overlay in overlays} == {"rv_base", "lvotvmax"}
    assert all(overlay["available"] is False for overlay in overlays)
    assert all(overlay["structured"] is False for overlay in overlays)

    linear_payload_response = client.get(
        f"/api/instances/{sop_instance_uid}/overlays/linear_measurement/rv_base/payload"
    )
    doppler_payload_response = client.get(
        f"/api/instances/{sop_instance_uid}/overlays/doppler_measurement/lvotvmax/payload"
    )
    assert linear_payload_response.status_code == 404
    assert doppler_payload_response.status_code == 404
