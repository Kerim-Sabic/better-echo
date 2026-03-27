from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.api.inference.infer_echoprime_api import infer_echoprime
from app.api.inference.infer_panecho_api import infer_panecho
from app.core.config import settings
from app.core.artifacts import PANECHO_ECHOPRIME_COMBINED_TYPE
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet, PipelineArtifactSetState
from app.database_models.pipeline_jobs import PipelineJob
from app.helpers.ensemble.combine_panecho_echoprime_predictions import combine_results
from app.helpers.inference_runtime.inference_functions import unload_panecho_model
from app.schemas.inference.infer_echoprime_schemas import InferEchoPrimeRequest
from app.schemas.inference.infer_panecho_schemas import InferPanEchoRequest
from app.services.inference.echoprime_service import unload_ep
from app.services.pipeline.stages.prefilter import _prefilter_instances, _study_uid_for_job

logger = logging.getLogger(__name__)


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
    # Part 2.1 Apply staged model unload in low-VRAM/runtime-stage policy.
    unload_after_stage = (
        str(settings.PIPELINE_UNLOAD_POLICY).strip().lower() == "stage"
        or str(settings.INFERENCE_PROFILE).strip().lower() == "low_vram"
    )

    try:
        study_uid = _study_uid_for_job(db, job)
        logger.info(
            "[PIPELINE_COMBINED] Starting combined stage | job_id=%s study_uid=%s draft_artifact_set_id=%s unload_after_stage=%s",
            job.id,
            study_uid,
            draft_artifact_set.id,
            unload_after_stage,
        )
        instances = _prefilter_instances(prefilter_payload)
        eligible_orthanc_ids = [
            item.get("instance_orthanc_id")
            for item in instances
            if bool(item.get("combined_eligible")) and item.get("instance_orthanc_id")
        ]
        logger.info(
            "[PIPELINE_COMBINED] Resolved eligible instances | job_id=%s eligible_count=%s",
            job.id,
            len(eligible_orthanc_ids),
        )
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

        logger.info("[PIPELINE_COMBINED] Running EchoPrime metrics | job_id=%s", job.id)
        ep_output = infer_echoprime(
            payload=InferEchoPrimeRequest(
                study_uid=study_uid,
                include_instance_orthanc_ids=eligible_orthanc_ids,
                artifact_set_id=draft_artifact_set.id,
            ),
            db=db,
        )
        logger.info(
            "[PIPELINE_COMBINED] EchoPrime metrics completed | job_id=%s num_instances=%s",
            job.id,
            ep_output.get("num_instances"),
        )
        # Part 2.2 Release EchoPrime residency immediately in staged unload mode.
        if unload_after_stage:
            unload_ep()
            logger.info("[PIPELINE_COMBINED] EchoPrime unloaded after stage boundary | job_id=%s", job.id)
        logger.info("[PIPELINE_COMBINED] Running PanEcho metrics | job_id=%s", job.id)
        panecho_output = infer_panecho(
            payload=InferPanEchoRequest(
                study_uid=study_uid,
                include_instance_orthanc_ids=eligible_orthanc_ids,
                artifact_set_id=draft_artifact_set.id,
            ),
            db=db,
        )
        logger.info(
            "[PIPELINE_COMBINED] PanEcho metrics completed | job_id=%s num_instances=%s",
            job.id,
            panecho_output.get("num_instances"),
        )
        # Part 2.3 Release PanEcho residency immediately in staged unload mode.
        if unload_after_stage:
            unload_panecho_model()
            logger.info("[PIPELINE_COMBINED] PanEcho unloaded after stage boundary | job_id=%s", job.id)

        combined = combine_results(
            study_uid,
            panecho_output.get("predictions") or {},
            ep_output.get("predictions") or {},
        )
        logger.info(
            "[PIPELINE_COMBINED] Combined predictions integrated | job_id=%s integrated_tasks_count=%s",
            job.id,
            len(combined.get("integrated_tasks", {})),
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
        logger.info("[PIPELINE_COMBINED] Combined stage persisted | job_id=%s", job.id)

        return {
            "combined_input_instances": len(eligible_orthanc_ids),
            "panecho_num_instances": panecho_output.get("num_instances"),
            "echoprime_num_instances": ep_output.get("num_instances"),
            "integrated_tasks_count": len(combined_payload["integrated_tasks"]),
        }
    finally:
        # Part 2.4 Safety cleanup for partial failures before explicit unload points.
        if unload_after_stage:
            unload_ep()
            unload_panecho_model()


__all__ = [
    "run_combined_stage",
    "_active_combined_overrides",
]
