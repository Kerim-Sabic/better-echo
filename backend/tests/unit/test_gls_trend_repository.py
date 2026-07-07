from app.core.artifacts import COMBINED_ANALYSIS_TYPE
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.pipeline_artifact_sets import (
    PipelineArtifactSet,
    PipelineArtifactSetState,
)
from app.database_models.studies import Study
from app.services.results.gls_trend_repository import build_patient_gls_trend


def _combined_row(study, *, value, artifact_set=None):
    return DerivedResult(
        study=study,
        type=COMBINED_ANALYSIS_TYPE,
        status=ResultStatus.complete,
        value_json={
            "integrated_tasks": {
                "gls": {
                    "integrated_value": value,
                    "units": "%",
                    "discrepancy": False,
                }
            },
            "overrides": {},
        },
        model_name="StudyAnalysisCombined",
        model_version="v1",
        artifact_set=artifact_set,
    )


def _study_like(seed, *, uid, date):
    return Study(
        study_uid=uid,
        study_date=date,
        description=f"Trend study {uid}",
        study_orthanc_id=f"orthanc-{uid}",
        status="completed",
        patient_id=seed.patient_id,
        user_id=seed.user_id,
    )


def _artifact_set(study, state):
    return PipelineArtifactSet(
        study=study,
        state=state,
        input_revision=1,
    )


def test_patient_gls_trend_uses_active_or_legacy_complete_results(
    db_session_factory, seeded_study
):
    db = db_session_factory()
    try:
        current_study = (
            db.query(Study)
            .filter(Study.id == seeded_study["study_id"])
            .one()
        )
        current_study.study_date = "20260301"

        legacy_study = _study_like(
            current_study, uid="gls-trend-legacy", date="20240101"
        )
        artifact_study = _study_like(
            current_study, uid="gls-trend-active", date="20250101"
        )
        active_set = _artifact_set(
            artifact_study, PipelineArtifactSetState.active
        )
        draft_set = _artifact_set(
            artifact_study, PipelineArtifactSetState.draft
        )
        current_active_set = _artifact_set(
            current_study, PipelineArtifactSetState.active
        )
        db.add_all(
            [
                legacy_study,
                artifact_study,
                active_set,
                draft_set,
                current_active_set,
            ]
        )
        db.flush()

        db.add_all(
            [
                _combined_row(legacy_study, value=-22.0),
                _combined_row(artifact_study, value=-18.0, artifact_set=active_set),
                _combined_row(artifact_study, value=-12.0, artifact_set=draft_set),
                _combined_row(current_study, value=-20.0, artifact_set=current_active_set),
            ]
        )
        db.commit()

        trend = build_patient_gls_trend(db, current_study)

        assert [point["study_uid"] for point in trend] == [
            "gls-trend-legacy",
            "gls-trend-active",
            seeded_study["study_uid"],
        ]
        assert [point["value"] for point in trend] == [-22.0, -18.0, -20.0]
    finally:
        db.close()
