from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.database_models.pipeline_artifact_sets import PipelineArtifactSet
from app.database_models.pipeline_jobs import PipelineJob
from app.database_models.pipeline_stage_runs import PipelineStageRun


# Part 1. Stage row serializer for pipeline status payloads.
def _serialize_stage(stage_row: PipelineStageRun) -> Dict[str, Any]:
    return {
        "stage_name": stage_row.stage_name,
        "status": stage_row.status.value,
        "payload": stage_row.payload_json if isinstance(stage_row.payload_json, dict) else None,
        "error": stage_row.error,
        "started_at": stage_row.started_at,
        "finished_at": stage_row.finished_at,
    }


# Part 2. Artifact set serializer for pipeline status payloads.
def _serialize_artifact_set(artifact_set: Optional[PipelineArtifactSet]) -> Optional[Dict[str, Any]]:
    if not artifact_set:
        return None
    return {
        "id": artifact_set.id,
        "state": artifact_set.state.value,
        "input_revision": artifact_set.input_revision,
        "pipeline_job_id": artifact_set.pipeline_job_id,
        "created_at": artifact_set.created_at,
        "promoted_at": artifact_set.promoted_at,
        "discarded_at": artifact_set.discarded_at,
    }


# Part 3. Pipeline job serializer for observer endpoints.
def _serialize_job(
    job: PipelineJob,
    stage_rows: List[PipelineStageRun],
    *,
    draft_artifact_set: Optional[PipelineArtifactSet],
    active_artifact_set: Optional[PipelineArtifactSet],
) -> Dict[str, Any]:
    return {
        "job_id": job.id,
        "study_id": job.study_id,
        "status": job.status.value,
        "current_stage": job.current_stage,
        "run_mode": job.run_mode.value,
        "cleanup_scope": job.cleanup_scope.value,
        "queued_at": job.queued_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "cancel_requested_at": job.cancel_requested_at,
        "is_cancel_requested": job.cancel_requested_at is not None,
        "updated_at": job.updated_at,
        "last_error": job.last_error,
        "uploaded_instance_uids": (
            job.uploaded_instance_uids_json
            if isinstance(job.uploaded_instance_uids_json, list)
            else []
        ),
        "stages": [_serialize_stage(row) for row in stage_rows],
        "artifact_sets": {
            "draft": _serialize_artifact_set(draft_artifact_set),
            "active": _serialize_artifact_set(active_artifact_set),
        },
    }


__all__ = [
    "_serialize_stage",
    "_serialize_artifact_set",
    "_serialize_job",
]

