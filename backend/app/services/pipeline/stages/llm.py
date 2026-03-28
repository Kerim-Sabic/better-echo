from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.core.artifacts import REPORT_SUMMARY_TYPE, COMBINED_ANALYSIS_TYPE
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet
from app.database_models.pipeline_jobs import PipelineJob
from app.helpers.pipeline.study_status import is_llm_enabled
from app.helpers.row_to_dict.combined_results_row_to_dict import build_combined_sections_for_llm
from app.prompting.builder import build_report_messages, extract_report_blocks
from app.prompting.params import LLMParams
from app.services.integrations.llm_client import LLMClient
from app.services.pipeline.stages.prefilter import _study_uid_for_job


# Part 1. Build and persist draft-scoped LLM report from draft combined artifact set.
def run_llm_stage(
    *,
    db: Session,
    job: PipelineJob,
    draft_artifact_set: PipelineArtifactSet,
) -> Dict[str, Any]:
    if not is_llm_enabled():
        return {"skipped": True, "reason": "LLM_DISABLED"}

    combined_row = (
        db.query(DerivedResult)
        .filter(
            DerivedResult.study_id == job.study_id,
            DerivedResult.type == COMBINED_ANALYSIS_TYPE,
            DerivedResult.artifact_set_id == draft_artifact_set.id,
            DerivedResult.status == ResultStatus.complete,
        )
        .first()
    )
    if not combined_row:
        raise RuntimeError("Draft combined results not ready for LLM stage")

    combined_value = combined_row.value_json if isinstance(combined_row.value_json, dict) else {}
    integrated_tasks = combined_value.get("integrated_tasks")
    if not isinstance(integrated_tasks, dict) or not integrated_tasks:
        return {"skipped": True, "reason": "NO_COMBINED_TASKS"}

    combined_sections = build_combined_sections_for_llm(combined_row)
    params = LLMParams()
    built = build_report_messages(
        study_uid=_study_uid_for_job(db, job),
        combined_sections=combined_sections,
        language="en",
        style="concise",
        params=params,
    )
    client = LLMClient()
    report_text = client.chat_completion(
        messages=built["messages"],
        temperature=params.temperature_report,
        top_p=params.top_p_report,
        seed=params.seed_report,
        max_tokens=built["max_tokens"],
    )
    blocks = extract_report_blocks(report_text)
    payload = {
        "report_md": blocks.get("report_md") or report_text,
        "diagnoses_json": blocks.get("diagnoses_json"),
        "raw_text": blocks.get("raw_text") or report_text,
        "model": client.model,
        "prompt_version": params.prompt_version,
        "report_generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
    }
    llm_row = (
        db.query(DerivedResult)
        .filter(
            DerivedResult.study_id == job.study_id,
            DerivedResult.type == REPORT_SUMMARY_TYPE,
            DerivedResult.artifact_set_id == draft_artifact_set.id,
        )
        .first()
    )
    if llm_row:
        llm_row.value_json = payload
        llm_row.status = ResultStatus.complete
    else:
        db.add(
            DerivedResult(
                study_id=job.study_id,
                type=REPORT_SUMMARY_TYPE,
                value_json=payload,
                model_name="LLM_Report_Generator",
                model_version="v1",
                status=ResultStatus.complete,
                artifact_set_id=draft_artifact_set.id,
            )
        )
    db.commit()
    return {"skipped": False, "diagnoses_count": len(payload.get("diagnoses_json") or [])}


__all__ = ["run_llm_stage"]
