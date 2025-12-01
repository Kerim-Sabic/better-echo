from typing import Optional, Dict, Any
import json

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
import torch
import logging
import numpy as np

from app.helpers.inference_functions import (fetch_orthanc_instance_ids_from_study,
                        pick_frames_from_instance,
                        stack_to_tensor,
                        get_model_and_device)
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

    # --- Part 1: Fetch all instance IDs for the study ---
    orthanc_instance_ids = fetch_orthanc_instance_ids_from_study(study_uid)
    if not orthanc_instance_ids:
        raise HTTPException(status_code=404, detail=f"No instances found for study_uid={study_uid}")

    logger.info(f"[INFER_PANECHO] found {len(orthanc_instance_ids)} instance(s) for study ")

    try:
        model, device = get_model_and_device()

        # --- Part 2: Collect predictions for each instance ---
        all_preds = []
        for orthanc_instance_id in orthanc_instance_ids:
            try:
                frames = pick_frames_from_instance(orthanc_instance_id, 16)
                x = stack_to_tensor(frames) # (1, 3, 16, 224, 224)
                logger.info(f"[INFER_PANECHO] Running inference on instance {orthanc_instance_id}")

                # --- Part 2.1: Run inference ---
                with torch.no_grad():
                    preds = model(x.to(device))  # PanEcho returns dict of {task: value}
                if not isinstance(preds, dict):
                    raise RuntimeError("Model did not return a dict of tasks")

                # --- Part 2.2: Normalize predictions for this instance ---
                results: Dict[str, Any] = {}
                for task, val in preds.items():
                    if torch.is_tensor(val):
                        if val.numel() == 1:
                            results[task] = float(val.detach().cpu().item())
                        else:
                            results[task] = val.detach().cpu().flatten().tolist()
                    elif isinstance(val, (list, tuple)):
                        results[task] = [float(v) for v in val]
                    else:
                        try:
                            results[task] = float(val)
                        except Exception:
                            results[task] = val
                
                # --- Part 2.3: Append to results list ---
                all_preds.append(results)
            
            except Exception as err:
                logger.warning(f"[INFER_PANECHO] Skipping instance {orthanc_instance_id}: {err}")
                continue
        
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
            derived_result = DerivedResult(
                study_id = study.id,
                type="PanEcho_AllTasks",
                value_json=json.dumps(aggregated),
                model_name="PanEcho",
                model_version="v1",
            )
            db.add(derived_result)
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
