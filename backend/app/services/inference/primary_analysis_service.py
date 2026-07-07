from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

import numpy as np
import torch
from sqlalchemy.orm import Session

from app.core.artifacts import PRIMARY_ANALYSIS_MODEL_NAME, PRIMARY_ANALYSIS_TYPE
from app.database_models.derived_results import DerivedResult
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.database_models.studies import Study
from app.helpers.inference_runtime.batch_config import get_batch_size
from app.helpers.inference_runtime.inference_functions import (
    cached_panecho_tensor,
    fetch_orthanc_instance_ids_from_study,
    get_model_and_device,
    pick_frames_from_instance,
    pick_frames_from_local_dicom,
    stack_to_tensor,
)
from app.helpers.media.frame_cache import get_study_frame_cache

logger = logging.getLogger(__name__)


# Part 1. Resolve local file paths for Orthanc instance IDs in this study.
def _local_file_path_map(
    *,
    db: Session,
    study_uid: str,
    orthanc_instance_ids: List[str],
) -> Dict[str, str]:
    if not orthanc_instance_ids:
        return {}

    rows = (
        db.query(Instance.instance_orthanc_id, Instance.file_path)
        .join(Instance.series)
        .join(Series.study)
        .filter(
            Study.study_uid == study_uid,
            Instance.instance_orthanc_id.in_(orthanc_instance_ids),
        )
        .all()
    )
    return {
        orthanc_id: file_path
        for orthanc_id, file_path in rows
        if orthanc_id and file_path and os.path.exists(file_path)
    }


# Part 2. Run primary-analysis metrics inference and persist study-level output.
def run_primary_analysis_metrics(
    *,
    study_uid: str,
    db: Session,
    include_instance_orthanc_ids: List[str] | None = None,
    artifact_set_id: int | None = None,
) -> Dict[str, Any]:
    logger.info("[PRIMARY_ANALYSIS] infer called with study_uid=%s", study_uid)

    orthanc_instance_ids = include_instance_orthanc_ids or fetch_orthanc_instance_ids_from_study(study_uid)
    if not orthanc_instance_ids:
        raise ValueError(f"No instances found for study_uid={study_uid}")

    logger.info("[PRIMARY_ANALYSIS] found %d instance(s) for study", len(orthanc_instance_ids))
    local_path_by_orthanc_id = _local_file_path_map(
        db=db,
        study_uid=study_uid,
        orthanc_instance_ids=orthanc_instance_ids,
    )
    if local_path_by_orthanc_id:
        logger.info(
            "[PRIMARY_ANALYSIS] Local DICOM fast-path available for %d/%d instance(s)",
            len(local_path_by_orthanc_id),
            len(orthanc_instance_ids),
        )

    model, device = get_model_and_device()
    frame_cache = get_study_frame_cache(study_uid)

    # Part 2.1 Collect predictions in batches and normalize per-instance outputs.
    all_preds = []
    batch_size = get_batch_size("primary_analysis")
    logger.info(
        "[PRIMARY_ANALYSIS] Starting batched inference | instances=%d batch_size=%d device=%s",
        len(orthanc_instance_ids),
        batch_size,
        device,
    )
    total_processed = 0

    for batch_start in range(0, len(orthanc_instance_ids), batch_size):
        batch_ids = orthanc_instance_ids[batch_start : batch_start + batch_size]
        tensors = []
        valid_ids = []

        for orthanc_instance_id in batch_ids:
            try:
                local_path = local_path_by_orthanc_id.get(orthanc_instance_id)
                tensor = None
                if local_path:
                    try:
                        if frame_cache is not None:
                            tensor = cached_panecho_tensor(frame_cache, local_path, 16)
                        else:
                            tensor = stack_to_tensor(pick_frames_from_local_dicom(local_path, 16))
                    except Exception as local_error:
                        logger.warning(
                            "[PRIMARY_ANALYSIS] Local frame read failed for %s (%s); falling back to Orthanc",
                            orthanc_instance_id,
                            local_error,
                        )
                if tensor is None:
                    tensor = stack_to_tensor(pick_frames_from_instance(orthanc_instance_id, 16))
                tensors.append(tensor)
                valid_ids.append(orthanc_instance_id)
            except Exception as err:
                logger.warning("[PRIMARY_ANALYSIS] Skipping instance %s: %s", orthanc_instance_id, err)
                continue

        if not tensors:
            continue

        batch_tensor = torch.cat(tensors, dim=0).to(device)

        logger.info("[PRIMARY_ANALYSIS] Running batch inference on %d instance(s)", len(valid_ids))
        with torch.no_grad():
            preds_batch = model(batch_tensor)
        if not isinstance(preds_batch, dict):
            raise RuntimeError("Model did not return a dict of tasks")

        for idx_in_batch in range(len(valid_ids)):
            results: Dict[str, Any] = {}
            for task, value in preds_batch.items():
                if torch.is_tensor(value):
                    slice_value = (
                        value[idx_in_batch]
                        if value.dim() > 0 and value.size(0) == len(valid_ids)
                        else value
                    )
                    if slice_value.numel() == 1:
                        results[task] = float(slice_value.detach().cpu().item())
                    else:
                        results[task] = slice_value.detach().cpu().flatten().tolist()
                elif isinstance(value, (list, tuple)):
                    results[task] = value[idx_in_batch] if len(value) == len(valid_ids) else value
                else:
                    try:
                        results[task] = float(value)
                    except Exception:
                        results[task] = value
            all_preds.append(results)

        total_processed += len(valid_ids)
        if total_processed == len(orthanc_instance_ids) or total_processed % max(1, batch_size) == 0:
            logger.info(
                "[PRIMARY_ANALYSIS] Processed %d/%d instances (device=%s)",
                total_processed,
                len(orthanc_instance_ids),
                device,
            )

    if not all_preds:
        raise RuntimeError(f"No predictions could be made for study_uid={study_uid}")

    # Part 2.2 Aggregate study-level predictions across instances.
    aggregated: Dict[str, Any] = {}
    for task in all_preds[0].keys():
        task_values = [prediction[task] for prediction in all_preds if task in prediction]

        if all(isinstance(value, (int, float)) for value in task_values):
            aggregated[task] = float(np.mean(task_values))
        elif all(isinstance(value, list) for value in task_values):
            aggregated[task] = np.array(task_values, dtype=np.float32).mean(axis=0).tolist()
        else:
            aggregated[task] = task_values[0]

    # Part 2.3 Persist aggregated study-level output.
    study = db.query(Study).filter(Study.study_uid == study_uid).first()
    if study:
        if artifact_set_id is not None:
            derived_result = (
                db.query(DerivedResult)
                .filter(
                    DerivedResult.study_id == study.id,
                    DerivedResult.type == PRIMARY_ANALYSIS_TYPE,
                    DerivedResult.artifact_set_id == artifact_set_id,
                )
                .first()
            )
            if not derived_result:
                derived_result = DerivedResult(
                    study_id=study.id,
                    type=PRIMARY_ANALYSIS_TYPE,
                    model_name=PRIMARY_ANALYSIS_MODEL_NAME,
                    model_version="v1",
                    artifact_set_id=artifact_set_id,
                )
                db.add(derived_result)
        else:
            derived_result = DerivedResult(
                study_id=study.id,
                type=PRIMARY_ANALYSIS_TYPE,
                model_name=PRIMARY_ANALYSIS_MODEL_NAME,
                model_version="v1",
            )
            db.add(derived_result)

        derived_result.value_json = aggregated
        db.commit()
        db.refresh(derived_result)
        logger.info(
            "[PRIMARY_ANALYSIS] Saved DerivedResult id=%s for study_id=%s",
            derived_result.id,
            study.id,
        )

    return {
        "study_uid": study_uid,
        "num_instances": len(orthanc_instance_ids),
        "predictions": aggregated,
    }


__all__ = [
    "run_primary_analysis_metrics",
]
