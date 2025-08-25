from typing import Optional, Dict, Any

from fastapi import APIRouter, Query, HTTPException
import torch
import logging

from api.infer import (fetch_instance_ids_from_study,
                        pick_frames_from_instance,
                        stack_to_tensor,
                        get_model_and_device)
from schemas.infer_panecho_schemas import AllTasksPanEchoResponse

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/infer/all", response_model=AllTasksPanEchoResponse)
def infer_all(instance_id: Optional[str] = Query(None), 
              study_uid: Optional[str] = Query(None)) -> Dict[str, Any]:
    """
    Run PanEcho inference for all 39 reporting tasks.
    Returns predictions as a dictionary {task_name: prediction}.
    """

    logger.info(f"[ALL] infer_all called with instance_id={instance_id} study_uid={study_uid}")

    if not instance_id and not study_uid:
        raise HTTPException(status_code=400, detail="Provide instance_id or study_uid")
    
    # Resolve instance_id if study_uid is provided
    if study_uid:
        ids = fetch_instance_ids_from_study(study_uid)
        if not ids:
            raise HTTPException(status_code=404, detail=f"No instance for study_uid={study_uid}")
        instance_id = ids[0] # crude choice: first cine
        logger.info(f"[ALL] Using instance_id={instance_id} from study")
    
    try:
        # ---- preprocess ----
        frames = pick_frames_from_instance(instance_id, 16)
        x = stack_to_tensor(frames) # should produce shape (1, 3, 16, 224, 224)
        model, device = get_model_and_device()
        logger.info(f"[ALL] Running inference on device={device} with input dtype={x.dtype}")

        # ---- run inference ----
        with torch.no_grad():
            preds = model(x.to(device))  # PanEcho returns dict of {task: value}
        
        if not isinstance(preds, dict):
            raise RuntimeError("Model did not return a dict of tasks")
        
        # ---- normalize predictions ----
        print(preds)
        results: Dict[str, Any] = {}
        for task, val in preds.items():
            if torch.is_tensor(val):
                # regression (scalar or vector)
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
                    results[task] = val # leave it as is if not numeric

        logger.info(f"[ALL] Prediction keys: {list(results.keys())}")
        return {"instance_id": instance_id, "predictions": results}
    
    except Exception as e:
        logger.exception(f"[ALL] Inference failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {type(e).__name__}: {e}")
