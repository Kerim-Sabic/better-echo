from __future__ import annotations
import logging
import os
from typing import Dict, List, Optional, Any

from sqlalchemy.orm import Session

from app.database.db import SessionLocal
from app.database_models.studies import Study
from app.database_models.series import Series
from app.database_models.instances import Instance
from app.database_models.derived_results import DerivedResult, ResultStatus
from app.api.inference.infer_echonet_dynamic_api import infer_lv_segmentation
from app.api.inference.infer_measurements_api import infer_measurements_2d
from app.helpers.view_classifier import classify_views_for_study
from app.core.artifacts import DYNAMIC_MEASUREMENTS_COMBINED_TYPE

logger = logging.getLogger(__name__)

# Map which tasks to run by view, with optional weights for measurements.
# Fill in real weights/model keys you need for your measurements service.
VIEW_TASK_MAP: Dict[str, List[Dict]] = {
    "A4C": [
        {"task": "echonet_dynamic_lv_segmentation"},
        {
            "task": "measurements_2d",
            "weights": [
                {"weights_name": "rv_base", "ui_label": "RV basal diameter"},
            ],
        },
    ],
    "PARASTERNAL_LONG": [
        {
            "task": "measurements_2d",
            "weights": [
                {"weights_name": "aorta",        "ui_label": "Ascending aorta diameter"},
                {"weights_name": "aortic_root",  "ui_label": "Aortic root diameter"},
                {"weights_name": "ivc",          "ui_label": "Inferior vena cava diameter"},
                {"weights_name": "ivs",          "ui_label": "Interventricular septal thickness"},
                {"weights_name": "la",           "ui_label": "Left atrial diameter"},
                {"weights_name": "lvid",         "ui_label": "LV internal diameter (LVIDd/LVIDs)"},
                {"weights_name": "lvpw",         "ui_label": "LV posterior wall thickness"},
                {"weights_name": "pa",           "ui_label": "Main pulmonary artery diameter"},
            ],
        }
    ],
}

def _tasks_for_view(view: str) -> List[Dict]:
    return VIEW_TASK_MAP.get((view or "").upper(), [])

def _run_echonet_dynamic(db: Session, instance: Instance) -> Dict[str, Any]:
    """
    Call EchoNet-Dynamic LV-segmentation route as a plain function (no HTTP).
    """
    try:
        if infer_lv_segmentation is None:
            return {"task": "echonet_dynamic_lv_segmentation", 
                    "status": "FAILED", 
                    "message": "infer_echonet_dynamic not wired", 
                    "ui_label": "Left Ventricle (LV) segmentation"}
        
        response = infer_lv_segmentation(instance.sop_instance_uid, db)
        output_path = (response or {}).get("output_file")

        if not output_path:
            return {"task": "echonet_dynamic_lv_segmentation", 
                    "status": "FAILED", 
                    "message": "No output path returned", 
                    "ui_label": "Left Ventricle (LV) segmentation"}
        
        return {"task": "echonet_dynamic_lv_segmentation", 
                "status": "DONE", 
                "output_path": output_path, 
                "ui_label": "Left Ventricle (LV) segmentation"}
    
    except Exception as err:
        logger.exception(f"[DYNAMIC_MEASUREMENTS_COMBINING] LV-seg failed for {instance.sop_instance_uid}: {err}")
        return {"task": "echonet_dynamic_lv_segmentation", 
                "status": "FAILED", 
                "message": str(err), "ui_label": "Left Ventricle (LV) segmentation"}

def _run_measurements(db: Session, instance: Instance, *, weights: Dict[str, str]) -> Dict[str, Any]:
    """
    Call 2D measurements route as a plain function (no HTTP).
    """
    weights_name = weights["weights_name"]
    ui_label = weights["ui_label"]
    try:
        if infer_measurements_2d is None:
            return {"task": "measurements_2d", 
                    "status": "FAILED", 
                    "message": "infer_measurements_2d not wired", 
                    "weights": weights_name,
                    "ui_label": ui_label}
    
        response = infer_measurements_2d(instance.sop_instance_uid, weights_name, db=db)
        output_path = (response or {}).get("output_file_mp4")
    
        if not output_path:
            return {"task": "measurements_2d", 
                    "status": "FAILED", 
                    "message": "No output path returned", 
                    "weights": weights_name,
                    "ui_label": ui_label}
        
        return {"task": "measurements_2d", 
                "status": "DONE", 
                "output_path": output_path, 
                "weights": weights_name,
                "ui_label": ui_label}

    except Exception as err:
        logger.exception(f"[DYNAMIC_MEASUREMENTS_COMBINING] 2D measurements failed for {instance.sop_instance_uid}: {err}")
        return {"task": "measurements_2d", 
                "status": "FAILED", 
                "message": str(err), 
                "weights": weights_name,
                "ui_label": ui_label}


def combining_dynamic_measurements(study_uid: str) -> None:
    """
    Background orchestration (single pass, no staleness logic).

    Part 1. Ensure a 'Dynamic_Measurements_Combined_Tasks' derived row exists (created by route as 'pending').
            Run view classification to persist per-instance predicted_view(+confidence).
    Part 2. Based on each instance's predicted_view, run LV-seg and/or 2D measurements with intended weights.
    Part 3. Aggregate and persist results into the same DerivedResult row (payload) and mark 'complete'.
    """
    db = SessionLocal()
    try:
        # --- Part 1. Resolve study + combined_results_row + classify views ---
        # --- Part 1.1 Resolve study ---
        study: Optional[Study] = db.query(Study).filter(Study.study_uid == study_uid).first()
        if not study:
            logger.warning(f"[DYNAMIC_MEASUREMENTS_COMBINING] study not found: {study_uid}")
            return
        
        # --- Part 1.2 Resolve combined_results_row ---
        combined_results_row: Optional[DerivedResult] = (
            db.query(DerivedResult)
            .filter(
                DerivedResult.study_id == study.id,
                DerivedResult.type == DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
            )
            .first()
        )

        # --- Part 1.3 Run view classification (the view and confidence persists to Instance table) ---
        try:
            classify_views_for_study(study_uid, db)
        except Exception as err:
            logger.exception(f"[DYNAMIC_MEASUREMENTS_COMBINING] view classification failed for {study_uid}: {err}")
            # Proceed anyway; instances may already have views, or we will mark SKIPPED below.
        
        # --- Part 1.4 Fetch instances after classification ---
        instances: List[Instance] = (
            db.query(Instance)
            .join(Instance.series)
            .join(Series.study)
            .filter(Study.id == study.id)
            .all()
        )

        # --- Part 2. Run conditional tasks per instance ---
        summaries: List[Dict[str, Any]] = []
        for instance in instances:
            predicted_view = (instance.predicted_view or "").upper()
            predicted_view_confidence = (instance.predicted_view_confidence or None)
            tasks_config = _tasks_for_view(predicted_view)
            instance_number = instance.instance_number

            # --- Part 2.1 If there is no inference for the instance with this view ---
            if not tasks_config:
                summaries.append({
                    "sop_instance_uid": instance.sop_instance_uid,
                    "instance_number": instance_number,
                    "predicted_view": instance.predicted_view,
                    "predicted_view_confidence": instance.predicted_view_confidence,
                    "results": [{"task": None, "status": "SKIPPED", "message": "No inference available for this view"}],
                })
                continue
            
            # --- Part 2.2 If there is inference for the instance with this view ---
            results: List[Dict[str, any]] = []
            for task in tasks_config:
                task_name = task.get("task")
                
                if task_name == "echonet_dynamic_lv_segmentation":
                    results.append(_run_echonet_dynamic(db, instance))
                    continue

                if task_name == "measurements_2d":
                    weights = task.get("weights")

                    if isinstance(weights, list) and weights:
                        for w in weights:
                            results.append(_run_measurements(db, instance, weights=w))
                        continue
                
                # If the task is unknown
                results.append({"task": task_name, "status": "SKIPPED", "message": "Unknown task"})

            summaries.append({
                "sop_instance_uid": instance.sop_instance_uid,
                "instance_number": instance_number,
                "predicted_view": instance.predicted_view,
                "predicted_view_confidence": predicted_view_confidence,
                "results": results,
            })

        # --- Part 3. Persist aggregated payload and mark complete ---
        if not combined_results_row:
            # --- Part 3.1 # Safety: create the row if it's missing (route should have created as 'pending') ---
            combined_results_row = DerivedResult(
                study_id = study.id,
                type=DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
                status=ResultStatus.pending,
                model_name="Dynamic_Measurements_Combined",
                model_version="v1",
            )
            db.add(combined_results_row)
            db.commit()
            db.refresh(combined_results_row)
        
        # --- Part 3.2 Persist the results in the database and change the status to complete ---
        combined_results_row.value_json = {"instances": summaries}
        combined_results_row.status = ResultStatus.complete
        db.add(combined_results_row)
        db.commit()

        logger.info(f"[DYNAMIC_MEASUREMENTS_COMBINING] Combined results persisted for study {study_uid} (instances={len(summaries)})")
    
    # --- Part 4. If an error occurs, change the combined_results_row status to failed ---
    except Exception as err:
        logger.exception(f"[DYNAMIC_MEASUREMENTS_COMBINING] Orchestration failed for {study_uid}: {err}")
        try:
            # Mark the combined results row as failed, if present
            study = db.query(Study).filter(Study.study_uid == study_uid).first()
            if study:
                row = (
                    db.query(DerivedResult)
                    .filter(
                        DerivedResult.study_id == study.id,
                        DerivedResult.type == DYNAMIC_MEASUREMENTS_COMBINED_TYPE,
                    )
                    .first()
                )
                if row:
                    row.status = ResultStatus.failed
                    db.add(row)
                    db.commit()
        except Exception:
            db.rollback()
    finally:
        try:
            db.close()
        except Exception:
            pass
