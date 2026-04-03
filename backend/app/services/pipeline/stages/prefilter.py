from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.database_models.pipeline_jobs import PipelineJob
from app.helpers.pipeline.pipeline_routing import build_prefilter_routing_map


# Part 1. Shared helpers for pipeline stage modules.
def _study_uid_for_job(db: Session, job: PipelineJob) -> str:
    return job.study.study_uid


def _prefilter_instances(prefilter_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    instances = prefilter_payload.get("instances") if isinstance(prefilter_payload, dict) else None
    return instances if isinstance(instances, list) else []


# Part 2. Execute compatibility + routing prefilter stage.
def run_prefilter_stage(*, db: Session, job: PipelineJob, confidence_min: float) -> Dict[str, Any]:
    study_uid = _study_uid_for_job(db, job)
    return build_prefilter_routing_map(
        db=db,
        study_uid=study_uid,
        confidence_min=confidence_min,
    )


__all__ = [
    "_study_uid_for_job",
    "_prefilter_instances",
    "run_prefilter_stage",
]

