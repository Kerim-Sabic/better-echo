from typing import Optional, Dict, Any
import json

from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session
import torch
import logging

from app.helpers.inference import (fetch_orthanc_instance_ids_from_study,
                        pick_frames_from_instance,
                        stack_to_tensor,
                        get_model_and_device)
from app.schemas.infer_panecho_schemas import AllTasksPanEchoResponse

from app.database.db import get_db
from app.models.studies import Study
from app.models.derived_results import DerivedResult

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/infer/panecho", response_model=AllTasksPanEchoResponse)
def infer_panecho(
    study_uid: str = Query(...),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Run PanEcho inference for all 39 reporting tasks, using study_uid only.
    Returns predictions as a dictionary {task_name: prediction}.
    Also records results in DerivedResult table.
    """

    logger.info(f"[ALL] infer_panecho called with study_uid={study_uid}")

    # Resolve orthanc_instance_id from study_uid
    orthanc_instance_ids = fetch_orthanc_instance_ids_from_study(study_uid)
    if not orthanc_instance_ids:
        raise HTTPException(status_code=404, detail=f"No instances found for study_uid={study_uid}")

    # crude choice: first cine instance
    orthanc_instance_id = orthanc_instance_ids[0]
    logger.info(f"[ALL] Using instance_id={orthanc_instance_id} from study")

    try:
        # ---- preprocess ----
        frames = pick_frames_from_instance(orthanc_instance_id, 16)
        x = stack_to_tensor(frames)  # (1, 3, 16, 224, 224)
        model, device = get_model_and_device()
        logger.info(f"[ALL] Running inference on device={device} with input dtype={x.dtype}")

        # ---- run inference ----
        with torch.no_grad():
            preds = model(x.to(device))  # PanEcho returns dict of {task: value}

        if not isinstance(preds, dict):
            raise RuntimeError("Model did not return a dict of tasks")

        # ---- normalize predictions ----
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

        # ---- Persist to DB ----
        study = db.query(Study).filter(Study.study_uid == study_uid).first()
        if study:
            if hasattr(study, "status"):
                study.status = "completed"

            dr = DerivedResult(
                study_id=study.id,
                type="PanEcho_AllTasks",
                value_numeric=None,
                value_json=json.dumps(results),
                units="%",
                model_name="PanEcho",
                model_version="v1",
            )
            db.add(dr)
            db.commit()
            db.refresh(dr)
            logger.info(f"[ALL] Saved DerivedResult id={dr.id} for study_id={study.id}")

        logger.info(f"[ALL] Prediction keys: {list(results.keys())}")
        return {"instance_id": orthanc_instance_id, "predictions": results}

    except Exception as e:
        logger.exception(f"[ALL] Inference failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Inference failed: {type(e).__name__}: {e}")