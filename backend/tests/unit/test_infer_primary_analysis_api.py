from PIL import Image
import torch

from app.api.inference.infer_primary_analysis_api import infer_primary_analysis
from app.schemas.inference.infer_primary_analysis_schemas import InferPrimaryAnalysisRequest


def test_infer_primary_analysis_falls_back_to_orthanc_when_local_read_fails(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    db = db_session_factory()
    try:
        calls = {"local": 0, "orthanc": 0}

        # Part 1. Use a single deterministic instance id for this test.
        monkeypatch.setattr(
            "app.api.inference.infer_primary_analysis_api.fetch_orthanc_instance_ids_from_study",
            lambda _study_uid: ["orthanc-instance-1"],
        )
        monkeypatch.setattr(
            "app.api.inference.infer_primary_analysis_api._local_file_path_map",
            lambda **_: {"orthanc-instance-1": "C:/nonexistent/local-instance.dcm"},
        )

        # Part 2. Force local path failure, then validate Orthanc fallback path is used.
        def _fail_local_read(_path, _num_frames):
            calls["local"] += 1
            raise RuntimeError("forced_local_read_failure")

        def _orthanc_read(_instance_id, _num_frames):
            calls["orthanc"] += 1
            return [Image.new("RGB", (224, 224), "black") for _ in range(16)]

        monkeypatch.setattr(
            "app.api.inference.infer_primary_analysis_api.pick_frames_from_local_dicom",
            _fail_local_read,
        )
        monkeypatch.setattr(
            "app.api.inference.infer_primary_analysis_api.pick_frames_from_instance",
            _orthanc_read,
        )

        monkeypatch.setattr(
            "app.api.inference.infer_primary_analysis_api.stack_to_tensor",
            lambda _frames: torch.zeros((1, 3, 16, 224, 224), dtype=torch.float32),
        )

        class _DummyPrimaryAnalysisModel:
            def __call__(self, batch_tensor):
                batch_size = int(batch_tensor.shape[0])
                return {"metric": torch.ones((batch_size,), dtype=torch.float32)}

        monkeypatch.setattr(
            "app.api.inference.infer_primary_analysis_api.get_model_and_device",
            lambda: (_DummyPrimaryAnalysisModel(), torch.device("cpu")),
        )

        response = infer_primary_analysis(
            payload=InferPrimaryAnalysisRequest(study_uid=seeded_study["study_uid"]),
            db=db,
        )

        assert calls["local"] == 1
        assert calls["orthanc"] == 1
        assert response["num_instances"] == 1
        assert "metric" in response["predictions"]
    finally:
        db.close()


