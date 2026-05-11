import torch
from fastapi import HTTPException

from app.core.config import settings
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.services.inference import secondary_analysis_service
from app.services.inference.secondary_analysis_service import (
    SECONDARY_ANALYSIS_STUDY_TOO_LARGE,
    SecondaryAnalysisStudyTooLargeError,
    classify_views_for_study,
    run_secondary_analysis_metrics,
)
from app.services.pipeline.service import (
    DICOM_UPLOAD_LIMIT_EXCEEDED,
    start_pipeline_job,
)
from app.database_models.pipeline_jobs import PipelineCleanupScope, PipelineRunMode


class _FakeClassifier:
    def __init__(self):
        self.batch_sizes = []

    def process_dicom_file(self, _path):
        return torch.zeros((3, 16, 224, 224), dtype=torch.float32)

    def get_views(self, stack_of_videos, **_kwargs):
        self.batch_sizes.append(int(stack_of_videos.shape[0]))
        return ["A4C"] * int(stack_of_videos.shape[0]), [0.95] * int(stack_of_videos.shape[0])


def test_classify_views_for_study_chunks_and_persists_predictions(
    db_session_factory,
    seeded_study,
    tmp_path,
    monkeypatch,
):
    db = db_session_factory()
    try:
        study_folder = tmp_path / seeded_study["study_uid"]
        study_folder.mkdir()
        series = Series(
            series_uid="series-secondary-chunk",
            modality="US",
            series_orthanc_id="orthanc-series-secondary-chunk",
            study_id=seeded_study["study_id"],
        )
        instances = []
        for idx in range(3):
            path = study_folder / f"{idx}.dcm"
            path.write_bytes(b"dicom")
            instances.append(
                Instance(
                    sop_instance_uid=f"sop-secondary-chunk-{idx}",
                    file_path=str(path),
                    instance_orthanc_id=f"orthanc-secondary-chunk-{idx}",
                    series=series,
                )
            )
        db.add(series)
        db.add_all(instances)
        db.commit()

        fake_ep = _FakeClassifier()
        monkeypatch.setattr(secondary_analysis_service, "UPLOAD_DIR", str(tmp_path))
        monkeypatch.setattr(settings, "SECONDARY_ANALYSIS_CLASSIFY_CHUNK_SIZE", 2)
        monkeypatch.setattr(settings, "SECONDARY_ANALYSIS_MAX_INSTANCES", 100)
        monkeypatch.setattr(secondary_analysis_service, "get_secondary_analysis_model", lambda: fake_ep)

        result = classify_views_for_study(seeded_study["study_uid"], db)

        assert fake_ep.batch_sizes == [2, 1]
        assert set(result) == {instance.sop_instance_uid for instance in instances}
        for instance in instances:
            db.refresh(instance)
            assert instance.predicted_view == "A4C"
            assert float(instance.predicted_view_confidence) == 0.95
    finally:
        db.close()


def test_secondary_analysis_metrics_rejects_oversize_before_model_load(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    db = db_session_factory()
    try:
        monkeypatch.setattr(settings, "SECONDARY_ANALYSIS_MAX_INSTANCES", 1)
        monkeypatch.setattr(
            secondary_analysis_service,
            "get_secondary_analysis_model",
            lambda: (_ for _ in ()).throw(AssertionError("model should not load")),
        )

        try:
            run_secondary_analysis_metrics(
                study_uid=seeded_study["study_uid"],
                db=db,
                include_instance_orthanc_ids=["one", "two"],
            )
            assert False, "Expected secondary-analysis oversize failure"
        except SecondaryAnalysisStudyTooLargeError as exc:
            assert SECONDARY_ANALYSIS_STUDY_TOO_LARGE in str(exc)
    finally:
        db.close()


def test_start_pipeline_job_rejects_upload_preview_above_dicom_cap(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    db = db_session_factory()
    try:
        monkeypatch.setattr(settings, "DICOM_UPLOAD_MAX_FILES", 1)
        try:
            start_pipeline_job(
                db=db,
                study_uid=seeded_study["study_uid"],
                user_id=seeded_study["user_id"],
                run_mode=PipelineRunMode.upload_preview,
                cleanup_scope=PipelineCleanupScope.none,
                uploaded_instance_uids=["one", "two"],
            )
            assert False, "Expected DICOM upload cap failure"
        except HTTPException as exc:
            assert exc.status_code == 400
            assert DICOM_UPLOAD_LIMIT_EXCEEDED in str(exc.detail)
    finally:
        db.close()
