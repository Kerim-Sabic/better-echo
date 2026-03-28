from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.api.inference.infer_primary_analysis_api import infer_primary_analysis
from app.api.inference.infer_secondary_analysis_api import infer_secondary_analysis
from app.core.config import settings
from app.core.artifacts import (
    COMBINED_ANALYSIS_MODEL_NAME,
    COMBINED_ANALYSIS_TYPE,
    COMBINED_ANALYSIS_TYPES,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet, PipelineArtifactSetState
from app.database_models.pipeline_jobs import PipelineJob
from app.helpers.ensemble.combine_study_analysis_predictions import combine_results
from app.helpers.inference_runtime.inference_functions import unload_primary_analysis_model
from app.schemas.inference.infer_primary_analysis_schemas import InferPrimaryAnalysisRequest
from app.schemas.inference.infer_secondary_analysis_schemas import InferSecondaryAnalysisRequest
from app.services.inference.secondary_analysis_service import unload_secondary_analysis_model
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
                DerivedResult.type.in_(COMBINED_ANALYSIS_TYPES),
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
                DerivedResult.type.in_(COMBINED_ANALYSIS_TYPES),
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
                    DerivedResult.type == COMBINED_ANALYSIS_TYPE,
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
                        type=COMBINED_ANALYSIS_TYPE,
                        status=ResultStatus.complete,
                        value_json=combined_payload,
                        model_name=COMBINED_ANALYSIS_MODEL_NAME,
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

        logger.info("[PIPELINE_COMBINED] Running secondary analysis metrics | job_id=%s", job.id)
        ep_output = infer_secondary_analysis(
            payload=InferSecondaryAnalysisRequest(
                study_uid=study_uid,
                include_instance_orthanc_ids=eligible_orthanc_ids,
                artifact_set_id=draft_artifact_set.id,
            ),
            db=db,
        )
        logger.info(
            "[PIPELINE_COMBINED] Secondary analysis metrics completed | job_id=%s num_instances=%s",
            job.id,
            ep_output.get("num_instances"),
        )
        # Part 2.2 Release secondary analysis residency immediately in staged unload mode.
        if unload_after_stage:
            unload_secondary_analysis_model()
            logger.info("[PIPELINE_COMBINED] Secondary analysis unloaded after stage boundary | job_id=%s", job.id)
        logger.info("[PIPELINE_COMBINED] Running primary analysis metrics | job_id=%s", job.id)
        primary_analysis_output = infer_primary_analysis(
            payload=InferPrimaryAnalysisRequest(
                study_uid=study_uid,
                include_instance_orthanc_ids=eligible_orthanc_ids,
                artifact_set_id=draft_artifact_set.id,
            ),
            db=db,
        )
        logger.info(
            "[PIPELINE_COMBINED] Primary analysis metrics completed | job_id=%s num_instances=%s",
            job.id,
            primary_analysis_output.get("num_instances"),
        )
        # Part 2.3 Release primary analysis residency immediately in staged unload mode.
        if unload_after_stage:
            unload_primary_analysis_model()
            logger.info("[PIPELINE_COMBINED] Primary analysis unloaded after stage boundary | job_id=%s", job.id)

        combined = combine_results(
            study_uid,
            primary_analysis_output.get("predictions") or {},
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
                DerivedResult.type == COMBINED_ANALYSIS_TYPE,
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
                type=COMBINED_ANALYSIS_TYPE,
                status=ResultStatus.complete,
                value_json=combined_payload,
                model_name=COMBINED_ANALYSIS_MODEL_NAME,
                model_version="v1",
                artifact_set_id=draft_artifact_set.id,
            )
            db.add(combined_row)
        db.commit()
        logger.info("[PIPELINE_COMBINED] Combined stage persisted | job_id=%s", job.id)

        return {
            "combined_input_instances": len(eligible_orthanc_ids),
            "primary_num_instances": primary_analysis_output.get("num_instances"),
            "secondary_num_instances": ep_output.get("num_instances"),
            "integrated_tasks_count": len(combined_payload["integrated_tasks"]),
        }
    finally:
        # Part 2.4 Safety cleanup for partial failures before explicit unload points.
        if unload_after_stage:
            unload_secondary_analysis_model()
            unload_primary_analysis_model()


__all__ = [
    "run_combined_stage",
    "_active_combined_overrides",
]
