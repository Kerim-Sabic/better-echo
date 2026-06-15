from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.artifacts import (
    LV_SEGMENTATION_OVERLAY_KIND,
    LV_SEGMENTATION_OVERLAY_TYPE,
    MOTION_SEGMENTATION_MODEL_NAME,
    MOTION_SEGMENTATION_TYPE,
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


def _seed_overlay_row(db, seeded_study, instance, *, value_json=None, artifact_set=None):
    document = _overlay_document(instance) if value_json is None else value_json
    row = DerivedResult(
        study_id=seeded_study["study_id"],
        instance_id=instance.id,
        artifact_set_id=artifact_set.id if artifact_set else None,
        type=MOTION_SEGMENTATION_TYPE,
        model_name=MOTION_SEGMENTATION_MODEL_NAME,
        model_version="v1",
        status=ResultStatus.complete,
        value_json=document,
    )
    db.add(row)
    db.commit()
    return row


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
