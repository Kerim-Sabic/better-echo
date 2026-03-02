from __future__ import annotations

from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.api.inference.infer_doppler_api import infer_measurements_doppler
from app.api.inference.infer_echonet_dynamic_api import infer_lv_segmentation
from app.api.inference.infer_measurements_api import infer_measurements_2d
from app.core.artifacts import DYNAMIC_MEASUREMENTS_COMBINED_TYPE
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet
from app.database_models.pipeline_jobs import PipelineJob
from app.services.pipeline.stages.prefilter import _prefilter_instances


# Part 1. Run dynamic + measurements lanes over routed instance list.
def run_dynamic_measurements_stage(
    *,
    db: Session,
    job: PipelineJob,
    draft_artifact_set: PipelineArtifactSet,
    prefilter_payload: Dict[str, Any],
) -> Dict[str, Any]:
    instances = _prefilter_instances(prefilter_payload)

    dynamic_runs = 0
    measurements_2d_runs = 0
    measurements_doppler_runs = 0
    skipped_instances = 0
    errors: List[str] = []
    summaries: List[Dict[str, Any]] = []

    for item in instances:
        sop_uid = item.get("sop_instance_uid")
        if not sop_uid:
            continue

        predicted_view = item.get("predicted_view")
        predicted_view_confidence = item.get("predicted_view_confidence")
        instance_results: List[Dict[str, Any]] = []
        dynamic_skip_reasons = item.get("dynamic_skip_reasons") if isinstance(item.get("dynamic_skip_reasons"), list) else []

        # Track non-eligible instances explicitly in combined summary payload.
        if not bool(item.get("dynamic_eligible")) and not item.get("doppler_weights"):
            skipped_instances += 1
            instance_results.append(
                {
                    "task": None,
                    "status": "SKIPPED",
                    "message": dynamic_skip_reasons[0] if dynamic_skip_reasons else "Instance not eligible for dynamic/measurements",
                }
            )

        # Dynamic lane execution.
        if bool(item.get("run_dynamic")) and bool(item.get("dynamic_eligible")):
            try:
                infer_lv_segmentation(
                    sop_instance_uid=sop_uid,
                    db=db,
                    artifact_set_id=draft_artifact_set.id,
                    skip_orthanc_check=True,
                )
                dynamic_runs += 1
                instance_results.append(
                    {
                        "task": "echonet_dynamic_lv_segmentation",
                        "status": "DONE",
                        "ui_label": "Left Ventricle (LV) segmentation",
                    }
                )
            except Exception as exc:
                errors.append(f"dynamic:{sop_uid}:{exc}")
                instance_results.append(
                    {
                        "task": "echonet_dynamic_lv_segmentation",
                        "status": "FAILED",
                        "message": str(exc),
                        "ui_label": "Left Ventricle (LV) segmentation",
                    }
                )

        # 2D weights lane execution.
        weights_2d = item.get("weights_2d") if isinstance(item.get("weights_2d"), list) else []
        if bool(item.get("dynamic_eligible")) and weights_2d:
            for weight_name in weights_2d:
                try:
                    infer_measurements_2d(
                        sop_instance_uid=sop_uid,
                        model_weights=weight_name,
                        force=True,
                        db=db,
                        artifact_set_id=draft_artifact_set.id,
                        skip_orthanc_check=True,
                    )
                    measurements_2d_runs += 1
                    instance_results.append(
                        {
                            "task": "measurements_2d",
                            "status": "DONE",
                            "weights": weight_name,
                            "ui_label": weight_name,
                        }
                    )
                except Exception as exc:
                    errors.append(f"measurements2d:{sop_uid}:{weight_name}:{exc}")
                    instance_results.append(
                        {
                            "task": "measurements_2d",
                            "status": "FAILED",
                            "message": str(exc),
                            "weights": weight_name,
                            "ui_label": weight_name,
                        }
                    )

        # Spectral Doppler lane execution.
        doppler_weights = item.get("doppler_weights") if isinstance(item.get("doppler_weights"), list) else []
        for weight_name in doppler_weights:
            try:
                infer_measurements_doppler(
                    sop_instance_uid=sop_uid,
                    model_weights=weight_name,
                    force=True,
                    db=db,
                    artifact_set_id=draft_artifact_set.id,
                )
                measurements_doppler_runs += 1
                instance_results.append(
                    {
                        "task": "measurements_doppler",
                        "status": "DONE",
                        "weights": weight_name,
                        "ui_label": weight_name,
                    }
                )
            except Exception as exc:
                errors.append(f"doppler:{sop_uid}:{weight_name}:{exc}")
                instance_results.append(
                    {
                        "task": "measurements_doppler",
                        "status": "FAILED",
                        "message": str(exc),
                        "weights": weight_name,
                        "ui_label": weight_name,
                    }
                )

        if not instance_results:
            skipped_instances += 1
            instance_results.append(
                {
                    "task": None,
                    "status": "SKIPPED",
                    "message": dynamic_skip_reasons[0] if dynamic_skip_reasons else "No dynamic/measurements tasks matched",
                }
            )

        summaries.append(
            {
                "sop_instance_uid": sop_uid,
                "predicted_view": predicted_view,
                "predicted_view_confidence": predicted_view_confidence,
                "results": instance_results,
            }
        )

    # Persist draft-scoped combined dynamic/measurements row.
    combined_payload = {
        "instances": summaries,
        "meta": {
            "dynamic_runs": dynamic_runs,
            "measurements_2d_runs": measurements_2d_runs,
            "measurements_doppler_runs": measurements_doppler_runs,
            "skipped_instances": skipped_instances,
            "error_count": len(errors),
        },
    }
    combined_row = (
        db.query(DerivedResult)
        .filter(
            DerivedResult.study_id == job.study_id,
            DerivedResult.type == DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
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
                type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
                status=ResultStatus.complete,
                value_json=combined_payload,
                model_name="Dynamic_Measurements_Combined",
                model_version="v1",
                artifact_set_id=draft_artifact_set.id,
            )
        )
    db.commit()

    return {
        "dynamic_runs": dynamic_runs,
        "measurements_2d_runs": measurements_2d_runs,
        "measurements_doppler_runs": measurements_doppler_runs,
        "skipped_instances": skipped_instances,
        "error_count": len(errors),
        "errors": errors[:25],
    }


__all__ = ["run_dynamic_measurements_stage"]

