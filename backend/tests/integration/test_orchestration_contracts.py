from fastapi.testclient import TestClient

from app.core.artifacts import (
    DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
    LLM_REPORT_TYPE,
    PANECHO_ECHOPRIME_COMBINED_TYPE,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet, PipelineArtifactSetState
from app.helpers.auth.authentication_functions import get_current_user_id


def test_panecho_echoprime_first_call_returns_pending_and_retry_after_no_side_effect(app, db_session_factory, seeded_study):
    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/PanEcho-EchoPrime-combined-results")

    assert response.status_code == 202
    assert response.headers.get("retry-after") == "3"
    body = response.json()
    assert body.get("status") == "pending"
    assert body.get("retry_after") == 3

    db = db_session_factory()
    try:
        row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == seeded_study["study_id"],
                DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE,
            )
            .first()
        )
        assert row is None
    finally:
        db.close()


def test_override_endpoint_returns_409_when_combined_not_ready(app, seeded_study):
    client = TestClient(app)
    response = client.patch(
        f"/api/studies/{seeded_study['study_uid']}/PanEcho-EchoPrime-overrides",
        json={"overrides": {"ejection_fraction": {"value": 60}}},
    )

    assert response.status_code == 409
    assert response.json().get("detail") == "Combined results are not ready"


def test_dynamic_measurements_returns_pending_when_missing_no_side_effect(app, db_session_factory, seeded_study):
    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/Dynamic-Measurements-combined-results")

    assert response.status_code == 202
    assert response.headers.get("retry-after") == "3"
    body = response.json()
    assert body.get("status") == "pending"
    assert body.get("retry_after") == 3

    db = db_session_factory()
    try:
        row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == seeded_study["study_id"],
                DerivedResult.type == DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
            )
            .first()
        )
        assert row is None
    finally:
        db.close()


def test_llm_results_returns_404_when_llm_disabled(app, seeded_study, monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "false")
    client = TestClient(app)

    response = client.get(f"/api/studies/{seeded_study['study_uid']}/llm-report-results")

    assert response.status_code == 404
    assert response.json().get("detail") == "LLM report disabled"


def test_results_routes_return_404_for_non_owner(app, seeded_study):
    app.dependency_overrides[get_current_user_id] = lambda: seeded_study["user_id"] + 1000
    client = TestClient(app)

    combined_response = client.get(
        f"/api/studies/{seeded_study['study_uid']}/PanEcho-EchoPrime-combined-results"
    )
    assert combined_response.status_code == 404

    dynamic_response = client.get(
        f"/api/studies/{seeded_study['study_uid']}/Dynamic-Measurements-combined-results"
    )
    assert dynamic_response.status_code == 404

    llm_response = client.get(f"/api/studies/{seeded_study['study_uid']}/llm-report-results")
    assert llm_response.status_code == 404

    override_response = client.patch(
        f"/api/studies/{seeded_study['study_uid']}/PanEcho-EchoPrime-overrides",
        json={"overrides": {"ejection_fraction": {"value": 60}}},
    )
    assert override_response.status_code == 404


def test_panecho_echoprime_failed_row_returns_failed_status(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        failed_row = DerivedResult(
            study_id=seeded_study["study_id"],
            type=PANECHO_ECHOPRIME_COMBINED_TYPE,
            status=ResultStatus.failed,
            value_json={"error": "combined failed"},
            model_name="PanEcho_EchoPrime_Combined",
            model_version="v1",
        )
        db.add(failed_row)
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/PanEcho-EchoPrime-combined-results")

    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "failed"


def test_dynamic_failed_row_returns_failed_status(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        failed_row = DerivedResult(
            study_id=seeded_study["study_id"],
            type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
            status=ResultStatus.failed,
            value_json={"error": "dynamic failed"},
            model_name="Dynamic_Measurements_Combined",
            model_version="v1",
        )
        db.add(failed_row)
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/Dynamic-Measurements-combined-results")

    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "failed"


def test_llm_failed_row_returns_failed_status_when_enabled(app, db_session_factory, seeded_study, monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "true")

    db = db_session_factory()
    try:
        failed_row = DerivedResult(
            study_id=seeded_study["study_id"],
            type=LLM_REPORT_TYPE,
            status=ResultStatus.failed,
            value_json={"error": "llm failed"},
            model_name="LLM_Report_Generator",
            model_version="v1",
        )
        db.add(failed_row)
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/llm-report-results")

    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "failed"


def test_combined_results_prefers_active_artifact_over_draft(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        active_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.active,
            input_revision=1,
        )
        draft_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.draft,
            input_revision=2,
        )
        db.add(active_set)
        db.add(draft_set)
        db.flush()

        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=PANECHO_ECHOPRIME_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"integrated_tasks": {"active_key": {"value": 1}}},
                model_name="PanEcho_EchoPrime_Combined",
                model_version="v1",
                artifact_set_id=active_set.id,
            )
        )
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=PANECHO_ECHOPRIME_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"integrated_tasks": {"draft_key": {"value": 2}}},
                model_name="PanEcho_EchoPrime_Combined",
                model_version="v1",
                artifact_set_id=draft_set.id,
            )
        )
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/PanEcho-EchoPrime-combined-results")

    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "complete"
    tasks = body.get("panecho_echoprime_results", {}).get("integrated_tasks", {})
    assert "active_key" in tasks
    assert "draft_key" not in tasks


def test_combined_results_preview_prefers_draft_artifact_over_active(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        active_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.active,
            input_revision=1,
        )
        draft_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.draft,
            input_revision=2,
        )
        db.add(active_set)
        db.add(draft_set)
        db.flush()

        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=PANECHO_ECHOPRIME_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"integrated_tasks": {"active_key": {"value": 1}}},
                model_name="PanEcho_EchoPrime_Combined",
                model_version="v1",
                artifact_set_id=active_set.id,
            )
        )
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=PANECHO_ECHOPRIME_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"integrated_tasks": {"draft_key": {"value": 2}}},
                model_name="PanEcho_EchoPrime_Combined",
                model_version="v1",
                artifact_set_id=draft_set.id,
            )
        )
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(
        f"/api/studies/{seeded_study['study_uid']}/PanEcho-EchoPrime-combined-results?preview=true"
    )

    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "complete"
    tasks = body.get("panecho_echoprime_results", {}).get("integrated_tasks", {})
    assert "draft_key" in tasks
    assert "active_key" not in tasks


def test_dynamic_results_preview_prefers_draft_artifact_over_active(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        active_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.active,
            input_revision=1,
        )
        draft_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.draft,
            input_revision=2,
        )
        db.add(active_set)
        db.add(draft_set)
        db.flush()

        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"instances": [{"sop_instance_uid": "active"}]},
                model_name="Dynamic_Measurements_Combined",
                model_version="v1",
                artifact_set_id=active_set.id,
            )
        )
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"instances": [{"sop_instance_uid": "draft"}]},
                model_name="Dynamic_Measurements_Combined",
                model_version="v1",
                artifact_set_id=draft_set.id,
            )
        )
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(
        f"/api/studies/{seeded_study['study_uid']}/Dynamic-Measurements-combined-results?preview=true"
    )

    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "complete"
    instances = body.get("dynamic_measurements_results", {}).get("instances", [])
    assert len(instances) == 1
    assert instances[0].get("sop_instance_uid") == "draft"


def test_dynamic_results_complete_exposes_instance_number_and_output_path(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        active_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.active,
            input_revision=3,
        )
        db.add(active_set)
        db.flush()

        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={
                    "instances": [
                        {
                            "sop_instance_uid": "1.2.3",
                            "instance_number": "17",
                            "predicted_view": "A4C",
                            "predicted_view_confidence": 0.99,
                            "results": [
                                {
                                    "task": "echonet_dynamic_lv_segmentation",
                                    "status": "DONE",
                                    "ui_label": "Left Ventricle (LV) segmentation",
                                    "output_path": "echonet_dynamic_LV-segmentation_files/study/instance.mp4",
                                }
                            ],
                        }
                    ]
                },
                model_name="Dynamic_Measurements_Combined",
                model_version="v1",
                artifact_set_id=active_set.id,
            )
        )
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(
        f"/api/studies/{seeded_study['study_uid']}/Dynamic-Measurements-combined-results"
    )

    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "complete"
    instances = body.get("dynamic_measurements_results", {}).get("instances", [])
    assert len(instances) == 1
    assert instances[0].get("instance_number") == "17"
    first_result = instances[0].get("results", [])[0]
    assert first_result.get("output_path", "").endswith(".mp4")


def test_dynamic_results_pending_preview_includes_partial_payload(app, db_session_factory, seeded_study):
    db = db_session_factory()
    try:
        draft_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.draft,
            input_revision=4,
        )
        db.add(draft_set)
        db.flush()

        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
                status=ResultStatus.pending,
                value_json={
                    "instances": [
                        {
                            "sop_instance_uid": "1.2.840.partial",
                            "instance_number": "20",
                            "predicted_view": "A4C",
                            "predicted_view_confidence": 0.95,
                            "results": [
                                {
                                    "task": "echonet_dynamic_lv_segmentation",
                                    "status": "DONE",
                                    "output_path": "echonet_dynamic_LV-segmentation_files/study/partial.mp4",
                                }
                            ],
                        }
                    ],
                    "meta": {"dynamic_runs": 1, "measurements_2d_runs": 0, "measurements_doppler_runs": 0, "skipped_instances": 0, "error_count": 0},
                },
                model_name="Dynamic_Measurements_Combined",
                model_version="v1",
                artifact_set_id=draft_set.id,
            )
        )
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(
        f"/api/studies/{seeded_study['study_uid']}/Dynamic-Measurements-combined-results?preview=true"
    )

    assert response.status_code == 202
    body = response.json()
    assert body.get("status") == "pending"
    partial = body.get("dynamic_measurements_results") or {}
    instances = partial.get("instances", [])
    assert len(instances) == 1
    assert instances[0].get("instance_number") == "20"


def test_llm_results_prefers_active_artifact_over_draft(app, db_session_factory, seeded_study, monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "true")

    db = db_session_factory()
    try:
        active_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.active,
            input_revision=1,
        )
        draft_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.draft,
            input_revision=2,
        )
        db.add(active_set)
        db.add(draft_set)
        db.flush()

        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=LLM_REPORT_TYPE,
                status=ResultStatus.complete,
                value_json={"report_md": "active"},
                model_name="LLM_Report_Generator",
                model_version="v1",
                artifact_set_id=active_set.id,
            )
        )
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=LLM_REPORT_TYPE,
                status=ResultStatus.complete,
                value_json={"report_md": "draft"},
                model_name="LLM_Report_Generator",
                model_version="v1",
                artifact_set_id=draft_set.id,
            )
        )
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/llm-report-results")

    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "complete"
    llm_report = body.get("llm_report") or {}
    assert llm_report.get("report_md") == "active"


def test_llm_results_preview_prefers_draft_artifact_over_active(app, db_session_factory, seeded_study, monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "true")

    db = db_session_factory()
    try:
        active_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.active,
            input_revision=1,
        )
        draft_set = PipelineArtifactSet(
            study_id=seeded_study["study_id"],
            pipeline_job_id=None,
            state=PipelineArtifactSetState.draft,
            input_revision=2,
        )
        db.add(active_set)
        db.add(draft_set)
        db.flush()

        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=LLM_REPORT_TYPE,
                status=ResultStatus.complete,
                value_json={"report_md": "active"},
                model_name="LLM_Report_Generator",
                model_version="v1",
                artifact_set_id=active_set.id,
            )
        )
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=LLM_REPORT_TYPE,
                status=ResultStatus.complete,
                value_json={"report_md": "draft"},
                model_name="LLM_Report_Generator",
                model_version="v1",
                artifact_set_id=draft_set.id,
            )
        )
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}/llm-report-results?preview=true")

    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "complete"
    llm_report = body.get("llm_report") or {}
    assert llm_report.get("report_md") == "draft"


def test_list_studies_marks_completed_without_llm_when_llm_disabled(app, db_session_factory, seeded_study, monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "false")

    db = db_session_factory()
    try:
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=PANECHO_ECHOPRIME_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"integrated_tasks": {}},
                model_name="PanEcho_EchoPrime_Combined",
                model_version="v1",
            )
        )
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"instances": []},
                model_name="Dynamic_Measurements_Combined",
                model_version="v1",
            )
        )
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get("/api/studies")
    assert response.status_code == 200
    studies = response.json()
    target = next((row for row in studies if row.get("study_uid") == seeded_study["study_uid"]), None)
    assert target is not None
    assert target.get("status") == "completed"


def test_list_studies_keeps_processing_until_llm_complete_when_llm_enabled(app, db_session_factory, seeded_study, monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "true")

    db = db_session_factory()
    try:
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=PANECHO_ECHOPRIME_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"integrated_tasks": {}},
                model_name="PanEcho_EchoPrime_Combined",
                model_version="v1",
            )
        )
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"instances": []},
                model_name="Dynamic_Measurements_Combined",
                model_version="v1",
            )
        )
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get("/api/studies")
    assert response.status_code == 200
    studies = response.json()
    target = next((row for row in studies if row.get("study_uid") == seeded_study["study_uid"]), None)
    assert target is not None
    assert target.get("status") == "processing"


def test_retrieve_study_self_heals_status_for_llm_disabled(app, db_session_factory, seeded_study, monkeypatch):
    monkeypatch.setenv("ENABLE_LLM", "false")

    db = db_session_factory()
    try:
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=PANECHO_ECHOPRIME_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"integrated_tasks": {}},
                model_name="PanEcho_EchoPrime_Combined",
                model_version="v1",
            )
        )
        db.add(
            DerivedResult(
                study_id=seeded_study["study_id"],
                type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json={"instances": []},
                model_name="Dynamic_Measurements_Combined",
                model_version="v1",
            )
        )
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    response = client.get(f"/api/studies/{seeded_study['study_uid']}")

    assert response.status_code == 200
    assert response.json().get("status") == "completed"
