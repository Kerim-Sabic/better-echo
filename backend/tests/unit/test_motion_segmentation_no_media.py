import hashlib
import os
from uuid import uuid4

import numpy as np
import torch

import app.services.inference.motion_segmentation.service as svc
from app.core.artifacts import (
    LV_SEGMENTATION_OVERLAY_KIND,
    LV_SEGMENTATION_OVERLAY_TYPE,
    MOTION_SEGMENTATION_TYPE,
    MOTION_SEGMENTATION_UPLOAD_DIRNAME,
    UPLOAD_DIR,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.helpers.media.mask_rle import decode_rle_to_mask


def _seed_instance(db, seeded_study, tmp_path):
    suffix = uuid4().hex[:8]
    dcm_path = tmp_path / f"{suffix}.dcm"
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


def test_structured_mode_creates_no_media_and_persists_overlay(
    db_session_factory,
    seeded_study,
    monkeypatch,
    tmp_path,
):
    db = db_session_factory()
    try:
        instance, dcm_path = _seed_instance(db, seeded_study, tmp_path)
        hash_before = _file_hash(dcm_path)

        frames = [np.zeros((64, 80, 3), np.uint8) for _ in range(6)]
        monkeypatch.setattr(svc, "_load_frames", lambda _path: (frames, 30.0, (80, 64)))

        def fake_probs(frames_arg, _device, _batch):
            for _ in frames_arg:
                prob = np.zeros((112, 112), np.float32)
                prob[40:70, 40:70] = 0.9
                yield prob

        monkeypatch.setattr(svc, "iter_lv_probabilities", fake_probs)
        monkeypatch.setattr(svc, "unload_motion_segmentation_model", lambda: None)
        monkeypatch.setattr(
            svc,
            "get_device_for_model",
            lambda _name: torch.device("cpu"),
        )

        result = svc.run_motion_segmentation(
            sop_instance_uid=instance.sop_instance_uid,
            db=db,
            skip_orthanc_check=True,
        )

        assert result["overlay_type"] == LV_SEGMENTATION_OVERLAY_TYPE
        assert result["kind"] == LV_SEGMENTATION_OVERLAY_KIND
        assert result["has_overlay"] is True
        assert result["output_file"] is None

        row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.instance_id == instance.id,
                DerivedResult.type == MOTION_SEGMENTATION_TYPE,
            )
            .first()
        )
        assert row is not None
        assert row.status == ResultStatus.complete

        doc = row.value_json
        assert doc["overlay_type"] == LV_SEGMENTATION_OVERLAY_TYPE
        assert doc["kind"] == LV_SEGMENTATION_OVERLAY_KIND
        assert doc["sop_instance_uid"] == instance.sop_instance_uid
        assert doc["instance_id"] == instance.id
        assert doc["frame_count"] == 6
        assert doc["frame_width"] == 80
        assert doc["frame_height"] == 64
        assert doc["mask_format"] == "rle"
        assert doc["processing"]["edge_smoothing"] is True
        assert doc["processing"]["edge_smoothing_method"]
        assert doc["processing"]["edge_smoothing_version"]
        assert len(doc["frames"]) == 6
        assert all("rle" in frame for frame in doc["frames"])

        decoded = decode_rle_to_mask(doc["frames"][0]["rle"])
        assert decoded.shape == (64, 80)
        assert decoded.sum() > 0

        study_media_dir = os.path.join(
            UPLOAD_DIR,
            MOTION_SEGMENTATION_UPLOAD_DIRNAME,
            seeded_study["study_uid"],
        )
        assert not os.path.isdir(study_media_dir) or not any(
            os.scandir(study_media_dir)
        )
        assert _file_hash(dcm_path) == hash_before
    finally:
        db.close()
