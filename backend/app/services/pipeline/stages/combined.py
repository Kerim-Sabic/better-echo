from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.api.inference.infer_echoprime_api import infer_echoprime
from app.api.inference.infer_panecho_api import infer_panecho
from app.core.artifacts import PANECHO_ECHOPRIME_COMBINED_TYPE
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet, PipelineArtifactSetState
from app.database_models.pipeline_jobs import PipelineJob
from app.helpers.ensemble.combine_panecho_echoprime_predictions import combine_results
from app.schemas.inference.infer_echoprime_schemas import InferEchoPrimeRequest
from app.schemas.inference.infer_panecho_schemas import InferPanEchoRequest
from app.services.pipeline.stages.prefilter import _prefilter_instances, _study_uid_for_job


# Part 1. Resolve active combined override map for regenerate-safe persistence.
def _active_combined_overrides(db: Session, *, study_id: int) -> tuple[Dict[str, Any], Optional[str]]:
    active_set = (
        db.query(PipelineArtifactSet)
        .filter(
            PipelineArtifactSet.study_id == study_id,
            PipelineArtifactSet.state == PipelineArtifactSetState.active,
        )
        .order_by(PipelineArtifactSet.id.desc())
        .first()
    )
    row = None
    if active_set:
        row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == study_id,
                DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE,
                DerivedResult.status == ResultStatus.complete,
                DerivedResult.artifact_set_id == active_set.id,
            )
            .order_by(DerivedResult.id.desc())
            .first()
        )

    # Transitional fallback for legacy non-artifact rows.
    if not row:
        row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == study_id,
                DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE,
                DerivedResult.status == ResultStatus.complete,
                DerivedResult.artifact_set_id.is_(None),
            )
            .order_by(DerivedResult.id.desc())
            .first()
        )
    if not row or not isinstance(row.value_json, dict):
        return {}, None
    overrides = row.value_json.get("overrides")
    overrides_at = row.value_json.get("overrides_updated_at")
    return (
        overrides if isinstance(overrides, dict) else {},
        overrides_at if isinstance(overrides_at, str) else None,
    )


# Part 2. Run combined stage over prefiltered instance subset.
def run_combined_stage(
    *,
    db: Session,
    job: PipelineJob,
    draft_artifact_set: PipelineArtifactSet,
    prefilter_payload: Dict[str, Any],
) -> Dict[str, Any]:
    study_uid = _study_uid_for_job(db, job)
    instances = _prefilter_instances(prefilter_payload)
    eligible_orthanc_ids = [
        item.get("instance_orthanc_id")
        for item in instances
        if bool(item.get("combined_eligible")) and item.get("instance_orthanc_id")
    ]
    existing_overrides, overrides_updated_at = _active_combined_overrides(db, study_id=job.study_id)
    if not eligible_orthanc_ids:
        combined_payload = {
            "integrated_tasks": {},
            "overrides": existing_overrides,
            "overrides_updated_at": overrides_updated_at,
        }
        combined_row = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == job.study_id,
                DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE,
                DerivedResult.artifact_set_id == draft_artifact_set.id,
            )
            .first()
        )
        if combined_row:
            combined_row.value_json = combined_payload
            combined_row.status = ResultStatus.complete
        else:
            db.add(
                DerivedResult(
                    study_id=job.study_id,
                    type=PANECHO_ECHOPRIME_COMBINED_TYPE,
                    status=ResultStatus.complete,
                    value_json=combined_payload,
                    model_name="PanEcho_EchoPrime_Combined",
                    model_version="v1",
                    artifact_set_id=draft_artifact_set.id,
                )
            )
        db.commit()
        return {
            "skipped": True,
            "reason": "NO_ELIGIBLE_INSTANCES",
            "combined_input_instances": 0,
            "integrated_tasks_count": 0,
        }

    ep_output = infer_echoprime(
        payload=InferEchoPrimeRequest(
            study_uid=study_uid,
            include_instance_orthanc_ids=eligible_orthanc_ids,
            artifact_set_id=draft_artifact_set.id,
        ),
        db=db,
    )
    panecho_output = infer_panecho(
        payload=InferPanEchoRequest(
            study_uid=study_uid,
            include_instance_orthanc_ids=eligible_orthanc_ids,
            artifact_set_id=draft_artifact_set.id,
        ),
        db=db,
    )

    combined = combine_results(
        study_uid,
        panecho_output.get("predictions") or {},
        ep_output.get("predictions") or {},
    )
    combined_payload = {
        "integrated_tasks": combined.get("integrated_tasks", {}),
        "overrides": existing_overrides,
        "overrides_updated_at": overrides_updated_at,
    }

    combined_row = (
        db.query(DerivedResult)
        .filter(
            DerivedResult.study_id == job.study_id,
            DerivedResult.type == PANECHO_ECHOPRIME_COMBINED_TYPE,
            DerivedResult.artifact_set_id == draft_artifact_set.id,
        )
        .first()
    )
    if combined_row:
        combined_row.value_json = combined_payload
        combined_row.status = ResultStatus.complete
    else:
        combined_row = DerivedResult(
            study_id=job.study_id,
            type=PANECHO_ECHOPRIME_COMBINED_TYPE,
            status=ResultStatus.complete,
            value_json=combined_payload,
            model_name="PanEcho_EchoPrime_Combined",
            model_version="v1",
            artifact_set_id=draft_artifact_set.id,
        )
        db.add(combined_row)
    db.commit()

    return {
        "combined_input_instances": len(eligible_orthanc_ids),
        "panecho_num_instances": panecho_output.get("num_instances"),
        "echoprime_num_instances": ep_output.get("num_instances"),
        "integrated_tasks_count": len(combined_payload["integrated_tasks"]),
    }


__all__ = [
    "run_combined_stage",
    "_active_combined_overrides",
]

