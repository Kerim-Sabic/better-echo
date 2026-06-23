from uuid import uuid4

from app.core.artifacts import (
    LV_SEGMENTATION_OVERLAY_KIND,
    LV_SEGMENTATION_OVERLAY_TYPE,
    MEASUREMENT_WORKFLOW_TYPE,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.instances import Instance
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet, PipelineArtifactSetState
from app.database_models.pipeline_jobs import (
    PipelineCleanupScope,
    PipelineJob,
    PipelineJobStatus,
    PipelineRunMode,
)
from app.database_models.series import Series
from app.services.pipeline.stages.dynamic_measurements import run_dynamic_measurements_stage


def _build_job_runtime_graph(db, *, seeded_study):
    # Part 1. Create minimal study graph required by dynamic stage.
    suffix = uuid4().hex[:8]
    series = Series(
        series_uid=f"series-{suffix}",
        modality="US",
        description="Test Series",
        series_orthanc_id=f"orthanc-series-{suffix}",
        study_id=seeded_study["study_id"],
    )
    instance = Instance(
        sop_instance_uid=f"sop-{suffix}",
        file_path=f"/tmp/{suffix}.dcm",
        instance_orthanc_id=f"orthanc-instance-{suffix}",
        instance_number="14",
        predicted_view="A4C",
        predicted_view_confidence=0.99,
        series=series,
    )
    job = PipelineJob(
        study_id=seeded_study["study_id"],
        user_id=seeded_study["user_id"],
        # Part 1. Stage unit tests execute handler directly; avoid occupying global scheduler slots.
        status=PipelineJobStatus.completed,
        run_mode=PipelineRunMode.upload_preview,
        cleanup_scope=PipelineCleanupScope.none,
        uploaded_instance_uids_json=[],
    )
    draft_set = PipelineArtifactSet(
        study_id=seeded_study["study_id"],
        pipeline_job=job,
        state=PipelineArtifactSetState.draft,
        input_revision=1,
    )
    db.add_all([series, instance, job, draft_set])
    db.commit()
    db.refresh(instance)
    db.refresh(job)
    db.refresh(draft_set)
    return instance, job, draft_set


def _lv_overlay_payload(*, frame_count=12, mean_confidence=0.87):
    # Part 1. Mirror structured LV segmentation output without any legacy media path.
    return {
        "output_file": None,
        "overlay_type": LV_SEGMENTATION_OVERLAY_TYPE,
        "kind": LV_SEGMENTATION_OVERLAY_KIND,
        "has_overlay": True,
        "frame_count": frame_count,
        "mean_confidence": mean_confidence,
    }


def test_dynamic_stage_persists_instance_number_and_output_paths(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    db = db_session_factory()
    try:
        instance, job, draft_set = _build_job_runtime_graph(db, seeded_study=seeded_study)

        # Part 2. Stub inference calls with deterministic media paths.
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_motion_segmentation",
            lambda **_: _lv_overlay_payload(),
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_linear_measurements",
            lambda **_: {"output_file_mp4": "linear_measurements_files/study/instance/rv_base.mp4"},
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_spectral_measurements",
            lambda **_: {"output_file_image": "measurement_spectral/study/instance/lvotvmax.jpg"},
        )
        derived_calls = []

        def _attach_derived_side_effect(**kwargs):
            derived_calls.append(kwargs.get("series_label"))
            return {"series_label": kwargs.get("series_label")}

        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements._attach_derived_dicom_artifact",
            _attach_derived_side_effect,
        )

        payload = {
            "instances": [
                {
                    "sop_instance_uid": instance.sop_instance_uid,
                    "instance_number": instance.instance_number,
                    "predicted_view": "A4C",
                    "predicted_view_confidence": 0.99,
                    "dynamic_eligible": True,
                    "run_dynamic": True,
                    "weights_2d": ["rv_base"],
                    "doppler_weights": ["lvotvmax"],
                    "dynamic_skip_reasons": [],
                }
            ]
        }
        run_dynamic_measurements_stage(
            db=db,
            job=job,
            draft_artifact_set=draft_set,
            prefilter_payload=payload,
        )

        # Part 3. Validate combined row payload contract.
        combined_row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == seeded_study["study_id"],
                DerivedResult.type == MEASUREMENT_WORKFLOW_TYPE,
                DerivedResult.artifact_set_id == draft_set.id,
            )
            .first()
        )
        assert combined_row is not None
        assert combined_row.status == ResultStatus.complete

        value_json = combined_row.value_json or {}
        instances = value_json.get("instances", [])
        assert len(instances) == 1
        summary = instances[0]
        assert summary.get("instance_number") == "14"

        by_task = {entry.get("task"): entry for entry in summary.get("results", [])}
        assert by_task["motion_segmentation_lv"]["output_path"] is None
        assert by_task["motion_segmentation_lv"]["overlay"] == {
            "overlay_type": LV_SEGMENTATION_OVERLAY_TYPE,
            "kind": LV_SEGMENTATION_OVERLAY_KIND,
            "available": True,
            "frame_count": 12,
            "mean_confidence": 0.87,
        }
        assert "derived_dicom" not in by_task["motion_segmentation_lv"]
        assert by_task["measurement_linear"]["output_path"].endswith(".mp4")
        assert by_task["measurement_linear"]["derived_dicom"] == {
            "series_label": "Right Ventricular Basal Diameter"
        }
        assert by_task["measurement_spectral"]["output_path"].endswith(".jpg")
        assert by_task["measurement_spectral"]["output_kind"] == "image"
        assert "LV Segmentation" not in derived_calls
        assert "Right Ventricular Basal Diameter" in derived_calls
    finally:
        db.close()


def test_dynamic_stage_handles_pydantic_style_response_objects(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    class _DopplerResponse:
        # Part 1. Minimal pydantic-like response object with model_dump support.
        def model_dump(self):
            return {"output_file_image": "measurement_spectral/study/instance/avvmax.jpg"}

    db = db_session_factory()
    try:
        instance, job, draft_set = _build_job_runtime_graph(db, seeded_study=seeded_study)

        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_motion_segmentation",
            lambda **_: _lv_overlay_payload(),
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_linear_measurements",
            lambda **_: {"output_file_mp4": "linear_measurements_files/study/instance/rv_base.mp4"},
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_spectral_measurements",
            lambda **_: _DopplerResponse(),
        )

        payload = {
            "instances": [
                {
                    "sop_instance_uid": instance.sop_instance_uid,
                    "instance_number": instance.instance_number,
                    "predicted_view": "A4C",
                    "predicted_view_confidence": 0.99,
                    "dynamic_eligible": True,
                    "run_dynamic": False,
                    "weights_2d": [],
                    "doppler_weights": ["avvmax"],
                    "dynamic_skip_reasons": [],
                }
            ]
        }
        run_dynamic_measurements_stage(
            db=db,
            job=job,
            draft_artifact_set=draft_set,
            prefilter_payload=payload,
        )

        combined_row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == seeded_study["study_id"],
                DerivedResult.type == MEASUREMENT_WORKFLOW_TYPE,
                DerivedResult.artifact_set_id == draft_set.id,
            )
            .first()
        )
        assert combined_row is not None
        summary = (combined_row.value_json or {}).get("instances", [])[0]
        doppler_result = next(
            entry for entry in summary.get("results", []) if entry.get("task") == "measurement_spectral"
        )
        assert doppler_result.get("output_path").endswith(".jpg")
    finally:
        db.close()


def test_dynamic_stage_persists_pending_progress_between_tasks(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    db = db_session_factory()
    try:
        instance, job, draft_set = _build_job_runtime_graph(db, seeded_study=seeded_study)
        progress_seen = {"value": False}

        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_motion_segmentation",
            lambda **_: _lv_overlay_payload(),
        )

        def _measurements_side_effect(**_):
            # Part 1. During second task, dynamic result should already be persisted as pending.
            combined_row = (
                db.query(DerivedResult)
                .filter(
                    DerivedResult.study_id == seeded_study["study_id"],
                    DerivedResult.type == MEASUREMENT_WORKFLOW_TYPE,
                    DerivedResult.artifact_set_id == draft_set.id,
                )
                .first()
            )
            assert combined_row is not None
            assert combined_row.status == ResultStatus.pending
            summaries = (combined_row.value_json or {}).get("instances", [])
            assert len(summaries) == 1
            first_results = summaries[0].get("results", [])
            assert any(r.get("task") == "motion_segmentation_lv" for r in first_results)
            progress_seen["value"] = True
            return {"output_file_mp4": "linear_measurements_files/study/instance/rv_base.mp4"}

        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_linear_measurements",
            _measurements_side_effect,
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_spectral_measurements",
            lambda **_: {"output_file_image": "measurement_spectral/study/instance/lvotvmax.jpg"},
        )

        payload = {
            "instances": [
                {
                    "sop_instance_uid": instance.sop_instance_uid,
                    "instance_number": instance.instance_number,
                    "predicted_view": "A4C",
                    "predicted_view_confidence": 0.99,
                    "dynamic_eligible": True,
                    "run_dynamic": True,
                    "weights_2d": ["rv_base"],
                    "doppler_weights": [],
                    "dynamic_skip_reasons": [],
                }
            ]
        }
        run_dynamic_measurements_stage(
            db=db,
            job=job,
            draft_artifact_set=draft_set,
            prefilter_payload=payload,
        )

        assert progress_seen["value"] is True
        combined_row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == seeded_study["study_id"],
                DerivedResult.type == MEASUREMENT_WORKFLOW_TYPE,
                DerivedResult.artifact_set_id == draft_set.id,
            )
            .first()
        )
        assert combined_row is not None
        assert combined_row.status == ResultStatus.complete
    finally:
        db.close()


def test_dynamic_stage_failure_keeps_previous_progress(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    db = db_session_factory()
    try:
        instance, job, draft_set = _build_job_runtime_graph(db, seeded_study=seeded_study)

        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_motion_segmentation",
            lambda **_: _lv_overlay_payload(),
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_linear_measurements",
            lambda **_: (_ for _ in ()).throw(RuntimeError("forced_measurements_failure")),
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_spectral_measurements",
            lambda **_: {"output_file_image": "measurement_spectral/study/instance/lvotvmax.jpg"},
        )

        payload = {
            "instances": [
                {
                    "sop_instance_uid": instance.sop_instance_uid,
                    "instance_number": instance.instance_number,
                    "predicted_view": "A4C",
                    "predicted_view_confidence": 0.99,
                    "dynamic_eligible": True,
                    "run_dynamic": True,
                    "weights_2d": ["rv_base"],
                    "doppler_weights": [],
                    "dynamic_skip_reasons": [],
                }
            ]
        }
        run_dynamic_measurements_stage(
            db=db,
            job=job,
            draft_artifact_set=draft_set,
            prefilter_payload=payload,
        )

        combined_row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == seeded_study["study_id"],
                DerivedResult.type == MEASUREMENT_WORKFLOW_TYPE,
                DerivedResult.artifact_set_id == draft_set.id,
            )
            .first()
        )
        assert combined_row is not None
        assert combined_row.status == ResultStatus.complete
        value_json = combined_row.value_json or {}
        assert value_json.get("meta", {}).get("error_count") == 1
        results = value_json.get("instances", [])[0].get("results", [])
        by_task = {entry.get("task"): entry for entry in results}
        assert by_task["motion_segmentation_lv"]["status"] == "DONE"
        assert by_task["measurement_linear"]["status"] == "FAILED"
    finally:
        db.close()


def test_dynamic_stage_executes_lane_order_dynamic_then_weight_batches(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    db = db_session_factory()
    try:
        instance, job, draft_set = _build_job_runtime_graph(db, seeded_study=seeded_study)
        call_order = []

        # Part 1. Collect execution order across dynamic/2D/doppler lanes.
        def _dynamic_side_effect(**kwargs):
            call_order.append(("dynamic", kwargs.get("sop_instance_uid")))
            return _lv_overlay_payload()

        def _measurements_side_effect(**kwargs):
            call_order.append(("2d", kwargs.get("model_weights"), kwargs.get("sop_instance_uid")))
            return {"output_file_mp4": f"m2d/{kwargs.get('model_weights')}/{kwargs.get('sop_instance_uid')}.mp4"}

        def _doppler_side_effect(**kwargs):
            call_order.append(("doppler", kwargs.get("model_weights"), kwargs.get("sop_instance_uid")))
            return {"output_file_image": f"doppler/{kwargs.get('model_weights')}/{kwargs.get('sop_instance_uid')}.jpg"}

        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_motion_segmentation",
            _dynamic_side_effect,
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_linear_measurements",
            _measurements_side_effect,
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_spectral_measurements",
            _doppler_side_effect,
        )

        second_uid = f"{instance.sop_instance_uid}-second"
        payload = {
            "instances": [
                {
                    "sop_instance_uid": instance.sop_instance_uid,
                    "instance_number": instance.instance_number,
                    "predicted_view": "A4C",
                    "predicted_view_confidence": 0.99,
                    "dynamic_eligible": True,
                    "run_dynamic": True,
                    "weights_2d": ["rv_base", "ivs"],
                    "doppler_weights": ["lvotvmax"],
                    "dynamic_skip_reasons": [],
                },
                {
                    "sop_instance_uid": second_uid,
                    "instance_number": "15",
                    "predicted_view": "A4C",
                    "predicted_view_confidence": 0.98,
                    "dynamic_eligible": True,
                    "run_dynamic": True,
                    "weights_2d": ["rv_base"],
                    "doppler_weights": ["lvotvmax", "avvmax"],
                    "dynamic_skip_reasons": [],
                },
            ]
        }
        run_dynamic_measurements_stage(
            db=db,
            job=job,
            draft_artifact_set=draft_set,
            prefilter_payload=payload,
        )

        # Part 2. Assert lane-first execution order.
        assert call_order == [
            ("dynamic", instance.sop_instance_uid),
            ("dynamic", second_uid),
            ("2d", "rv_base", instance.sop_instance_uid),
            ("2d", "rv_base", second_uid),
            ("2d", "ivs", instance.sop_instance_uid),
            ("doppler", "lvotvmax", instance.sop_instance_uid),
            ("doppler", "lvotvmax", second_uid),
            ("doppler", "avvmax", second_uid),
        ]
    finally:
        db.close()


def test_dynamic_stage_unloads_measurement_caches_between_weights_in_stage_policy(
    db_session_factory,
    seeded_study,
    monkeypatch,
):
    db = db_session_factory()
    try:
        instance, job, draft_set = _build_job_runtime_graph(db, seeded_study=seeded_study)

        # Part 1. Stub inference and collect unload calls.
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_motion_segmentation",
            lambda **_: _lv_overlay_payload(),
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_linear_measurements",
            lambda **kwargs: {"output_file_mp4": f"m2d/{kwargs.get('model_weights')}.mp4"},
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.run_spectral_measurements",
            lambda **kwargs: {"output_file_image": f"doppler/{kwargs.get('model_weights')}.jpg"},
        )

        unload_calls = {"m2d": 0, "doppler": 0}

        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.unload_2d_models",
            lambda: unload_calls.__setitem__("m2d", unload_calls["m2d"] + 1),
        )
        monkeypatch.setattr(
            "app.services.pipeline.stages.dynamic_measurements.unload_doppler_models",
            lambda: unload_calls.__setitem__("doppler", unload_calls["doppler"] + 1),
        )

        payload = {
            "instances": [
                {
                    "sop_instance_uid": instance.sop_instance_uid,
                    "instance_number": instance.instance_number,
                    "predicted_view": "A4C",
                    "predicted_view_confidence": 0.99,
                    "dynamic_eligible": True,
                    "run_dynamic": True,
                    "weights_2d": ["rv_base", "ivs"],
                    "doppler_weights": ["lvotvmax", "avvmax"],
                    "dynamic_skip_reasons": [],
                }
            ]
        }
        run_dynamic_measurements_stage(
            db=db,
            job=job,
            draft_artifact_set=draft_set,
            prefilter_payload=payload,
        )

        # Part 2. In staged unload mode we unload between weight groups and on stage exit.
        assert unload_calls["m2d"] >= 3
        assert unload_calls["doppler"] >= 3
    finally:
        db.close()


