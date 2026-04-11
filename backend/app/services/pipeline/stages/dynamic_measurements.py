from __future__ import annotations

from collections import OrderedDict
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.AI_models.measurements.runner_2d import unload_2d_models
from app.AI_models.measurements.runner_doppler import unload_doppler_models
from app.core.config import settings
from app.core.artifacts import (
    LINEAR_MEASUREMENTS_TASK_KEY,
    MEASUREMENT_WORKFLOW_TYPE,
    MOTION_SEGMENTATION_TASK_KEY,
    SPECTRAL_MEASUREMENTS_TASK_KEY,
)
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.database_models.instances import Instance
from app.database_models.pipeline_artifact_sets import PipelineArtifactSet
from app.database_models.pipeline_jobs import PipelineJob
from app.services.inference.linear_measurements_service import run_linear_measurements
from app.services.inference.motion_segmentation_service import (
    run_motion_segmentation,
    unload_motion_segmentation_model,
)
from app.services.inference.spectral_measurements_service import (
    run_spectral_measurements,
)
from app.services.upload_mp4_to_orthanc.upload_mp4_to_orthanc import publish_mp4_as_derived_dicom
from app.services.pipeline.stages.prefilter import _prefilter_instances

_2D_WEIGHT_DISPLAY_NAMES: dict[str, str] = {
    "ivs": " Intraventricular Septum",
    "lvid": "Left Ventricular Internal Diameter",
    "lvpw": "Left Ventricular Posterior Wall",
    "aorta": "Aorta",
    "aortic_root": "Aortic Root",
    "la": "Left Atrium",
    "rv_base": "Right Ventricular Basal Diameter",
    "pa": "Pulmonary Artery",
    "ivc": "Inferior Vena Cava",
}


# Part 1. Normalize inference response objects into plain dict payloads.
def _response_payload(response: Any) -> Dict[str, Any]:
    if isinstance(response, dict):
        return response
    model_dump = getattr(response, "model_dump", None)
    if callable(model_dump):
        payload = model_dump()
        return payload if isinstance(payload, dict) else {}
    return {}


# Part 2. Build combined payload snapshot for draft progress persistence.
def _build_combined_payload(
    *,
    summaries: List[Dict[str, Any]],
    dynamic_runs: int,
    measurements_2d_runs: int,
    spectral_runs: int,
    skipped_instances: int,
    errors: List[str],
) -> Dict[str, Any]:
    return {
        "instances": summaries,
        "meta": {
            "motion_runs": dynamic_runs,
            "linear_runs": measurements_2d_runs,
            "spectral_runs": spectral_runs,
            "skipped_instances": skipped_instances,
            "error_count": len(errors),
        },
    }


# Part 3. Ensure one draft-scoped combined row exists and is marked pending.
def _ensure_pending_combined_row(
    *,
    db: Session,
    job: PipelineJob,
    draft_artifact_set: PipelineArtifactSet,
) -> DerivedResult:
    combined_row = (
        db.query(DerivedResult)
        .filter(
            DerivedResult.study_id == job.study_id,
            DerivedResult.type == MEASUREMENT_WORKFLOW_TYPE,
            DerivedResult.artifact_set_id == draft_artifact_set.id,
        )
        .first()
    )
    empty_payload = _build_combined_payload(
        summaries=[],
        dynamic_runs=0,
        measurements_2d_runs=0,
        spectral_runs=0,
        skipped_instances=0,
        errors=[],
    )
    if combined_row:
        combined_row.value_json = empty_payload
        combined_row.status = ResultStatus.pending
    else:
        combined_row = DerivedResult(
            study_id=job.study_id,
            type=MEASUREMENT_WORKFLOW_TYPE,
            status=ResultStatus.pending,
            value_json=empty_payload,
            model_name="StudyMeasurementsWorkflow",
            model_version="v1",
            artifact_set_id=draft_artifact_set.id,
        )
        db.add(combined_row)
    db.commit()
    return combined_row


# Part 4. Persist current draft progress snapshot.
def _persist_progress(
    *,
    db: Session,
    combined_row: DerivedResult,
    summaries: List[Dict[str, Any]],
    dynamic_runs: int,
    measurements_2d_runs: int,
    spectral_runs: int,
    skipped_instances: int,
    errors: List[str],
) -> None:
    combined_row.value_json = _build_combined_payload(
        summaries=summaries,
        dynamic_runs=dynamic_runs,
        measurements_2d_runs=measurements_2d_runs,
        spectral_runs=spectral_runs,
        skipped_instances=skipped_instances,
        errors=errors,
    )
    combined_row.status = ResultStatus.pending
    db.commit()


def _attach_derived_dicom_artifact(
    *,
    instance: Instance | None,
    output_path: str | None,
    series_label: str,
) -> Dict[str, Any] | None:
    if instance is None or not output_path:
        return None

    try:
        study_uid = instance.series.study.study_uid
        return publish_mp4_as_derived_dicom(
            source_dicom_path=instance.file_path,
            mp4_path=output_path,
            study_uid=study_uid,
            series_label=series_label,
        )
    except Exception:
        return None


def run_dynamic_measurements_stage(
    *,
    db: Session,
    job: PipelineJob,
    draft_artifact_set: PipelineArtifactSet,
    prefilter_payload: Dict[str, Any],
) -> Dict[str, Any]:
    # Part 5.1 Apply strict staged unload in low-VRAM/runtime-stage policy.
    unload_between_weights = (
        str(settings.PIPELINE_UNLOAD_POLICY).strip().lower() == "stage"
        or str(settings.INFERENCE_PROFILE).strip().lower() == "low_vram"
    )

    instances = _prefilter_instances(prefilter_payload)
    instance_uids = list(
        OrderedDict.fromkeys(
            item.get("sop_instance_uid")
            for item in instances
            if item.get("sop_instance_uid")
        ).keys()
    )
    instance_by_uid: Dict[str, Instance] = {}
    if instance_uids:
        instance_rows = db.query(Instance).filter(Instance.sop_instance_uid.in_(instance_uids)).all()
        instance_by_uid = {instance.sop_instance_uid: instance for instance in instance_rows}

    dynamic_runs = 0
    measurements_2d_runs = 0
    spectral_runs = 0
    skipped_instances = 0
    errors: List[str] = []
    summaries: List[Dict[str, Any]] = []
    summaries_by_uid: Dict[str, Dict[str, Any]] = {}
    lane_records: List[Dict[str, Any]] = []
    combined_row = _ensure_pending_combined_row(
        db=db,
        job=job,
        draft_artifact_set=draft_artifact_set,
    )

    # Part 6. Build per-instance summary rows and lane scheduling records.
    for item in instances:
        sop_uid = item.get("sop_instance_uid")
        if not sop_uid:
            continue

        instance_number = item.get("instance_number")
        predicted_view = item.get("predicted_view")
        predicted_view_confidence = item.get("predicted_view_confidence")
        instance_summary = summaries_by_uid.get(sop_uid)
        if not instance_summary:
            instance_summary = {
                "sop_instance_uid": sop_uid,
                "instance_number": instance_number,
                "predicted_view": predicted_view,
                "predicted_view_confidence": predicted_view_confidence,
                "results": [],
            }
            summaries_by_uid[sop_uid] = instance_summary
            summaries.append(instance_summary)
        instance_results: List[Dict[str, Any]] = instance_summary["results"]
        dynamic_skip_reasons = (
            item.get("dynamic_skip_reasons") if isinstance(item.get("dynamic_skip_reasons"), list) else []
        )
        dynamic_eligible = bool(item.get("dynamic_eligible"))
        run_dynamic = bool(item.get("run_dynamic")) and dynamic_eligible
        weights_2d = item.get("weights_2d") if isinstance(item.get("weights_2d"), list) else []
        doppler_weights = item.get("doppler_weights") if isinstance(item.get("doppler_weights"), list) else []

        # Track non-eligible/no-task instances explicitly in combined summary payload.
        has_any_lane_task = bool(run_dynamic or (dynamic_eligible and weights_2d) or doppler_weights)
        if not has_any_lane_task:
            skipped_instances += 1
            instance_results.append(
                {
                    "task": None,
                    "status": "SKIPPED",
                    "message": dynamic_skip_reasons[0]
                    if dynamic_skip_reasons
                    else "Instance not eligible for dynamic/measurements",
                }
            )
            _persist_progress(
                db=db,
                combined_row=combined_row,
                summaries=summaries,
                dynamic_runs=dynamic_runs,
                measurements_2d_runs=measurements_2d_runs,
                spectral_runs=spectral_runs,
                skipped_instances=skipped_instances,
                errors=errors,
            )
            continue

        lane_records.append(
            {
                "sop_uid": sop_uid,
                "instance": instance_by_uid.get(sop_uid),
                "instance_results": instance_results,
                "dynamic_eligible": dynamic_eligible,
                "run_dynamic": run_dynamic,
                "weights_2d": weights_2d,
                "doppler_weights": doppler_weights,
            }
        )

    # Part 7. Run dynamic lane for all eligible instances before 2D/Doppler lanes.
    if unload_between_weights:
        unload_motion_segmentation_model()
    try:
        for record in lane_records:
            if not record["run_dynamic"]:
                continue
            sop_uid = record["sop_uid"]
            instance_row = record["instance"]
            instance_results = record["instance_results"]
            try:
                dynamic_response = run_motion_segmentation(
                    sop_instance_uid=sop_uid,
                    db=db,
                    artifact_set_id=draft_artifact_set.id,
                    skip_orthanc_check=True,
                    defer_model_unload=unload_between_weights,
                )
                dynamic_payload = _response_payload(dynamic_response)
                dynamic_runs += 1
                output_path = dynamic_payload.get("output_file") or dynamic_payload.get("outputfile")
                derived_dicom = _attach_derived_dicom_artifact(
                    instance=instance_row,
                    output_path=output_path,
                    series_label="LV Segmentation",
                )

                result_item = {
                    "task": MOTION_SEGMENTATION_TASK_KEY,
                    "status": "DONE",
                    "ui_label": "Motion Segmentation",
                    "output_path": output_path,
                }
                if derived_dicom:
                    result_item["derived_dicom"] = derived_dicom

                instance_results.append(result_item)
            except Exception as exc:
                errors.append(f"dynamic:{sop_uid}:{exc}")
                instance_results.append(
                    {
                        "task": MOTION_SEGMENTATION_TASK_KEY,
                        "status": "FAILED",
                        "message": str(exc),
                        "ui_label": "Motion Segmentation",
                    }
                )
            _persist_progress(
                db=db,
                combined_row=combined_row,
                summaries=summaries,
                dynamic_runs=dynamic_runs,
                measurements_2d_runs=measurements_2d_runs,
                spectral_runs=spectral_runs,
                skipped_instances=skipped_instances,
                errors=errors,
            )
    finally:
        if unload_between_weights:
            unload_motion_segmentation_model()

    try:
        # Part 8. Run 2D lane one weight at a time across all eligible instances.
        ordered_2d_weights = list(
            OrderedDict.fromkeys(
                weight_name
                for record in lane_records
                if record["dynamic_eligible"]
                for weight_name in record["weights_2d"]
            ).keys()
        )
        for weight_name in ordered_2d_weights:
            if unload_between_weights:
                unload_2d_models()
            for record in lane_records:
                if not record["dynamic_eligible"] or weight_name not in record["weights_2d"]:
                    continue
                sop_uid = record["sop_uid"]
                instance_row = record["instance"]
                instance_results = record["instance_results"]
                try:
                    measurements_response = run_linear_measurements(
                        sop_instance_uid=sop_uid,
                        model_weights=weight_name,
                        force=True,
                        db=db,
                        artifact_set_id=draft_artifact_set.id,
                        skip_orthanc_check=True,
                        defer_model_unload=unload_between_weights,
                    )
                    measurements_payload = _response_payload(measurements_response)
                    measurements_2d_runs += 1
                    output_path = (
                        measurements_payload.get("output_file_mp4")
                        or measurements_payload.get("output_file")
                        or measurements_payload.get("outputfile")
                    )
                    derived_dicom = _attach_derived_dicom_artifact(
                        instance=instance_row,
                        output_path=output_path,
                        series_label=_2D_WEIGHT_DISPLAY_NAMES.get(weight_name, weight_name),
                    )

                    result_item = {
                        "task": LINEAR_MEASUREMENTS_TASK_KEY,
                        "status": "DONE",
                        "weights": weight_name,
                        "ui_label": weight_name,
                        "output_path": output_path,
                    }
                    if derived_dicom:
                        result_item["derived_dicom"] = derived_dicom

                    instance_results.append(result_item)
                except Exception as exc:
                    errors.append(f"measurements2d:{sop_uid}:{weight_name}:{exc}")
                    instance_results.append(
                        {
                            "task": LINEAR_MEASUREMENTS_TASK_KEY,
                            "status": "FAILED",
                            "message": str(exc),
                            "weights": weight_name,
                            "ui_label": weight_name,
                        }
                    )
                _persist_progress(
                    db=db,
                    combined_row=combined_row,
                    summaries=summaries,
                    dynamic_runs=dynamic_runs,
                    measurements_2d_runs=measurements_2d_runs,
                    spectral_runs=spectral_runs,
                    skipped_instances=skipped_instances,
                    errors=errors,
                )

        # Part 9. Run Doppler lane one weight at a time across all matching instances.
        ordered_doppler_weights = list(
            OrderedDict.fromkeys(
                weight_name
                for record in lane_records
                for weight_name in record["doppler_weights"]
            ).keys()
        )
        for weight_name in ordered_doppler_weights:
            if unload_between_weights:
                unload_doppler_models()
            for record in lane_records:
                if weight_name not in record["doppler_weights"]:
                    continue
                sop_uid = record["sop_uid"]
                instance_results = record["instance_results"]
                try:
                    doppler_response = run_spectral_measurements(
                        sop_instance_uid=sop_uid,
                        model_weights=weight_name,
                        force=True,
                        db=db,
                        artifact_set_id=draft_artifact_set.id,
                        defer_model_unload=unload_between_weights,
                    )
                    doppler_payload = _response_payload(doppler_response)
                    spectral_runs += 1
                    output_path = doppler_payload.get("output_file_image") or doppler_payload.get("outputfile")
                    instance_results.append(
                        {
                            "task": SPECTRAL_MEASUREMENTS_TASK_KEY,
                            "status": "DONE",
                            "weights": weight_name,
                            "ui_label": weight_name,
                            "output_path": output_path,
                            "output_kind": "image",
                        }
                    )
                except Exception as exc:
                    errors.append(f"doppler:{sop_uid}:{weight_name}:{exc}")
                    instance_results.append(
                        {
                            "task": SPECTRAL_MEASUREMENTS_TASK_KEY,
                            "status": "FAILED",
                            "message": str(exc),
                            "weights": weight_name,
                            "ui_label": weight_name,
                        }
                    )
                _persist_progress(
                    db=db,
                    combined_row=combined_row,
                    summaries=summaries,
                    dynamic_runs=dynamic_runs,
                    measurements_2d_runs=measurements_2d_runs,
                    spectral_runs=spectral_runs,
                    skipped_instances=skipped_instances,
                    errors=errors,
                )
    finally:
        # Part 9.1 Always clear measurement model caches at stage exit under staged unload policy.
        if unload_between_weights:
            unload_2d_models()
            unload_doppler_models()

    # Part 10. Mark draft-scoped combined row as complete.
    combined_row.value_json = _build_combined_payload(
        summaries=summaries,
        dynamic_runs=dynamic_runs,
        measurements_2d_runs=measurements_2d_runs,
        spectral_runs=spectral_runs,
        skipped_instances=skipped_instances,
        errors=errors,
    )
    combined_row.status = ResultStatus.complete
    db.commit()

    return {
        "motion_runs": dynamic_runs,
        "linear_runs": measurements_2d_runs,
        "spectral_runs": spectral_runs,
        "skipped_instances": skipped_instances,
        "error_count": len(errors),
        "errors": errors[:25],
    }


__all__ = [
    "run_dynamic_measurements_stage",
    "_build_combined_payload",
    "_ensure_pending_combined_row",
    "_persist_progress",
]
