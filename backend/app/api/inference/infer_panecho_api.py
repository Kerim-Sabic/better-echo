from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import torch
import logging
import numpy as np

from app.helpers.inference_runtime.inference_functions import (fetch_orthanc_instance_ids_from_study,
                        pick_frames_from_instance,
                        stack_to_tensor,
                        get_model_and_device)
from app.helpers.inference_runtime.batch_config import get_batch_size
from app.schemas.inference.infer_panecho_schemas import (AllTasksPanEchoResponse,
                                            InferPanEchoRequest)

from app.database.db import get_db
from app.database_models.studies import Study
from app.database_models.derived_results import DerivedResult

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/infer/panecho", response_model=AllTasksPanEchoResponse)
def infer_panecho(
    payload: InferPanEchoRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Run PanEcho inference for all 39 reporting tasks using a study UID and return study-level aggregated results.

    Steps:
    1. Resolve all Orthanc instance IDs for the study from Orthanc.
    2. For each instance, pick representative frames, stack them into a tensor, and run the PanEcho model.
    3. Normalize and collect per-instance predictions into `all_preds`.
    4. Aggregate predictions across instances for each task (mean for scalars/lists, fallback to first otherwise).
    5. Persist a DerivedResult row with the aggregated predictions and mark the study as completed if applicable.
    6. Return the study UID, number of instances, and aggregated predictions.
    """

    study_uid = payload.study_uid

    logger.info(f"[INFER_PANECHO] infer_panecho called with study_uid={study_uid}")

    # --- Part 1: Resolve input instance set ---
    orthanc_instance_ids = payload.include_instance_orthanc_ids or fetch_orthanc_instance_ids_from_study(study_uid)
    if not orthanc_instance_ids:
        raise HTTPException(status_code=404, detail=f"No instances found for study_uid={study_uid}")

    logger.info(f"[INFER_PANECHO] found {len(orthanc_instance_ids)} instance(s) for study ")

    try:
        model, device = get_model_and_device()

        # --- Part 2: Collect predictions (batched) ---
        all_preds = []
        batch_size = get_batch_size("panecho")
        logger.info(
            "[INFER_PANECHO] Starting batched inference | instances=%d batch_size=%d device=%s",
            len(orthanc_instance_ids),
            batch_size,
            device,
        )
        total_processed = 0

        for batch_start in range(0, len(orthanc_instance_ids), batch_size):
            batch_ids = orthanc_instance_ids[batch_start: batch_start + batch_size]
            tensors = []
            valid_ids = []

            for orthanc_instance_id in batch_ids:
                try:
                    frames = pick_frames_from_instance(orthanc_instance_id, 16)
                    x = stack_to_tensor(frames)  # (1, 3, 16, 224, 224)
                    tensors.append(x)
                    valid_ids.append(orthanc_instance_id)
                except Exception as err:
                    logger.warning(f"[INFER_PANECHO] Skipping instance {orthanc_instance_id}: {err}")
                    continue

            if not tensors:
                continue

            batch_tensor = torch.cat(tensors, dim=0).to(device)  # (B, 3, 16, 224, 224)

            logger.info(f"[INFER_PANECHO] Running batch inference on {len(valid_ids)} instance(s)")
            with torch.no_grad():
                preds_batch = model(batch_tensor)
            if not isinstance(preds_batch, dict):
                raise RuntimeError("Model did not return a dict of tasks")

            for idx_in_batch in range(len(valid_ids)):
                results: Dict[str, Any] = {}
                for task, val in preds_batch.items():
                    if torch.is_tensor(val):
                        slice_val = val[idx_in_batch] if val.dim() > 0 and val.size(0) == len(valid_ids) else val
                        if slice_val.numel() == 1:
                            results[task] = float(slice_val.detach().cpu().item())
                        else:
                            results[task] = slice_val.detach().cpu().flatten().tolist()
                    elif isinstance(val, (list, tuple)):
                        if len(val) == len(valid_ids):
                            results[task] = val[idx_in_batch]
                        else:
                            results[task] = val
                    else:
                        try:
                            results[task] = float(val)
                        except Exception:
                            results[task] = val
                all_preds.append(results)

            total_processed += len(valid_ids)
            if total_processed == len(orthanc_instance_ids) or total_processed % max(1, batch_size) == 0:
                logger.info(
                    "[INFER_PANECHO] Processed %d/%d instances (device=%s)",
                    total_processed,
                    len(orthanc_instance_ids),
                    device,
                )
        
        if not all_preds:
            raise HTTPException(status_code=500, detail="No predictions could be made for this study")

        # --- Part 3: Aggregate predictions across instances ---
        aggregated: Dict[str, Any] = {}
        tasks = all_preds[0].keys()

        for task in tasks:
            task_values = [p[task] for p in all_preds if task in p]

            # Part 3.1: case 1: scalars (regression outputs)
            if all(isinstance(value, (int, float)) for value in task_values):
                aggregated[task] = float(np.mean(task_values))
            
            # Part 3.2: case 2: lists (classification probs or multi-value outputs)
            elif all(isinstance(value, list) for value in task_values):
                arr = np.array(task_values, dtype=np.float32) # shape (N, K)
                aggregated[task] = arr.mean(axis=0).tolist()

            # Part 3.3: case 3: fallback, just take the first
            else:
                aggregated[task] = task_values[0]

        # --- Part 4: Save aggregated results to database ---
        study = db.query(Study).filter(Study.study_uid == study_uid).first()
        if study:
            # Part 4.1 Queue mode writes into draft-scoped artifact set.
            if payload.artifact_set_id is not None:
                derived_result = (
                    db.query(DerivedResult)
                    .filter(
                        DerivedResult.study_id == study.id,
                        DerivedResult.type == "PanEcho_AllTasks",
                        DerivedResult.artifact_set_id == payload.artifact_set_id,
                    )
                    .first()
                )
                if not derived_result:
                    derived_result = DerivedResult(
                        study_id=study.id,
                        type="PanEcho_AllTasks",
                        model_name="PanEcho",
                        model_version="v1",
                        artifact_set_id=payload.artifact_set_id,
                    )
                    db.add(derived_result)
            else:
                derived_result = DerivedResult(
                    study_id=study.id,
                    type="PanEcho_AllTasks",
                    model_name="PanEcho",
                    model_version="v1",
                )
                db.add(derived_result)

            derived_result.value_json = aggregated
            db.commit()
            db.refresh(derived_result)
            logger.info(f"[INFER_PANECHO] Saved DerivedResult id={derived_result.id} for study_id={study.id}")

        # --- Part 5: Return study-level predictions
        return {
            "study_uid": study_uid,
            "num_instances": len(orthanc_instance_ids),
            "predictions": aggregated
            }

    except Exception as err:
        logger.exception(f"[INFER_PANECHO] Inference failed: {type(err).__name__}: {err}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {type(err).__name__}: {err}")

