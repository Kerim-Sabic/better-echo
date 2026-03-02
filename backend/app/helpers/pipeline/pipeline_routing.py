from __future__ import annotations

import os
from collections import Counter
from typing import Any, Dict, List, Optional

import pydicom
from sqlalchemy.orm import Session

from app.database_models.instances import Instance
from app.database_models.series import Series
from app.database_models.studies import Study
from app.helpers.doppler.doppler_tags import inspect_doppler_tags
from app.helpers.ensemble.view_classifier import classify_views_for_study

# Part 0. Queue prefilter skip reason codes.
INCOMPATIBLE_DICOM = "INCOMPATIBLE_DICOM"
SPECTRAL_DOPPLER_TAG_ROUTED = "SPECTRAL_DOPPLER_TAG_ROUTED"
LOW_VIEW_CONFIDENCE = "LOW_VIEW_CONFIDENCE"
NO_TASK_MATCH = "NO_TASK_MATCH"
VIEW_CLASSIFIER_FAILED = "VIEW_CLASSIFIER_FAILED"


# Part 1. Dynamic/2D weights per supported classifier view.
VIEW_TASK_MAP: Dict[str, Dict[str, Any]] = {
    "A4C": {
        "run_dynamic": True,
        "weights_2d": ["rv_base"],
    },
    "PARASTERNAL_LONG": {
        "run_dynamic": False,
        "weights_2d": ["aorta", "aortic_root", "ivc", "ivs", "la", "lvid", "lvpw", "pa"],
    },
}

# Part 2. Doppler weights by spectral subtype.
PW_DOPPLER_WEIGHTS = ["lvotvmax", "latevel", "medevel", "mvpeak_2c", "tapse_2c"]
CW_DOPPLER_WEIGHTS = ["avvmax", "trvmax", "mrvmax"]


def _detect_hard_compatibility(instance: Instance) -> tuple[bool, Optional[str]]:
    # Part 3. Basic hard compatibility checks before any model execution.
    if not instance.file_path or not os.path.exists(instance.file_path):
        return False, INCOMPATIBLE_DICOM

    modality = (instance.series.modality or "").strip().upper() if instance.series else ""
    if modality and modality != "US":
        return False, INCOMPATIBLE_DICOM

    try:
        ds = pydicom.dcmread(instance.file_path, stop_before_pixels=True, force=True)
    except Exception:
        return False, INCOMPATIBLE_DICOM

    frames = getattr(ds, "NumberOfFrames", None)
    if frames is not None:
        try:
            if int(frames) <= 0:
                return False, INCOMPATIBLE_DICOM
        except Exception:
            return False, INCOMPATIBLE_DICOM

    return True, None


def _doppler_weights_for_subtype(subtype: Optional[str]) -> List[str]:
    subtype_norm = (subtype or "").strip().lower()
    if subtype_norm == "pw":
        return list(PW_DOPPLER_WEIGHTS)
    if subtype_norm == "cw":
        return list(CW_DOPPLER_WEIGHTS)
    return list(PW_DOPPLER_WEIGHTS + CW_DOPPLER_WEIGHTS)


def build_prefilter_routing_map(
    *,
    db: Session,
    study_uid: str,
    confidence_min: float,
) -> Dict[str, Any]:
    """
    Build routing decisions for queue stages with persisted skip reasons.
    """
    # Part 4. Ensure study exists and refresh classifier outputs.
    study = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise ValueError("Study not found")

    classifier_failed = False
    classifier_error = None
    try:
        classify_views_for_study(study_uid, db)
    except Exception as exc:
        classifier_failed = True
        classifier_error = str(exc)

    instances: List[Instance] = (
        db.query(Instance)
        .join(Instance.series)
        .join(Series.study)
        .filter(Study.id == study.id)
        .all()
    )

    decisions: List[Dict[str, Any]] = []
    skip_counter = Counter()
    combined_eligible_count = 0
    doppler_routed_count = 0

    for instance in instances:
        combined_skip_reasons: List[str] = []
        dynamic_skip_reasons: List[str] = []

        is_compatible, compatibility_reason = _detect_hard_compatibility(instance)
        if not is_compatible and compatibility_reason:
            combined_skip_reasons.append(compatibility_reason)
            dynamic_skip_reasons.append(compatibility_reason)
            skip_counter[compatibility_reason] += 1

        doppler_report: Dict[str, Any] = {}
        doppler_region = None
        doppler_subtype = None
        doppler_weights: List[str] = []

        if is_compatible:
            doppler_report = inspect_doppler_tags(instance.file_path)
            if bool(doppler_report.get("is_doppler_candidate")):
                doppler_routed_count += 1
                combined_skip_reasons.append(SPECTRAL_DOPPLER_TAG_ROUTED)
                dynamic_skip_reasons.append(SPECTRAL_DOPPLER_TAG_ROUTED)
                skip_counter[SPECTRAL_DOPPLER_TAG_ROUTED] += 1
                details = doppler_report.get("details") or {}
                doppler_region = details.get("doppler_region")
                doppler_subtype = details.get("spectral_subtype")
                doppler_weights = _doppler_weights_for_subtype(doppler_subtype)

        predicted_view = (instance.predicted_view or "").upper() if instance.predicted_view else None
        predicted_conf = float(instance.predicted_view_confidence) if instance.predicted_view_confidence is not None else None
        view_tasks = VIEW_TASK_MAP.get(predicted_view or "")

        # Part 5. Apply confidence gate for classifier-routed (non-doppler) instances.
        if is_compatible and SPECTRAL_DOPPLER_TAG_ROUTED not in combined_skip_reasons:
            if classifier_failed and not predicted_view:
                combined_skip_reasons.append(VIEW_CLASSIFIER_FAILED)
                dynamic_skip_reasons.append(VIEW_CLASSIFIER_FAILED)
                skip_counter[VIEW_CLASSIFIER_FAILED] += 1
            elif predicted_conf is None or predicted_conf < confidence_min:
                combined_skip_reasons.append(LOW_VIEW_CONFIDENCE)
                dynamic_skip_reasons.append(LOW_VIEW_CONFIDENCE)
                skip_counter[LOW_VIEW_CONFIDENCE] += 1

        run_dynamic = bool(view_tasks and view_tasks.get("run_dynamic")) if view_tasks else False
        weights_2d = list(view_tasks.get("weights_2d", [])) if view_tasks else []

        # Part 6. Dynamic/measurements lane requires explicit task match.
        if (
            is_compatible
            and SPECTRAL_DOPPLER_TAG_ROUTED not in dynamic_skip_reasons
            and not run_dynamic
            and not weights_2d
        ):
            dynamic_skip_reasons.append(NO_TASK_MATCH)
            skip_counter[NO_TASK_MATCH] += 1

        combined_eligible = len(combined_skip_reasons) == 0
        dynamic_eligible = len(dynamic_skip_reasons) == 0

        if combined_eligible:
            combined_eligible_count += 1

        decisions.append(
            {
                "instance_id": instance.id,
                "instance_orthanc_id": instance.instance_orthanc_id,
                "sop_instance_uid": instance.sop_instance_uid,
                "file_path": instance.file_path,
                "predicted_view": predicted_view,
                "predicted_view_confidence": predicted_conf,
                "combined_eligible": combined_eligible,
                "dynamic_eligible": dynamic_eligible,
                "run_dynamic": run_dynamic,
                "weights_2d": weights_2d,
                "doppler_weights": doppler_weights,
                "doppler_subtype": doppler_subtype,
                "doppler_region": doppler_region,
                "combined_skip_reasons": combined_skip_reasons,
                "dynamic_skip_reasons": dynamic_skip_reasons,
            }
        )

    return {
        "study_uid": study_uid,
        "confidence_min": confidence_min,
        "classifier_failed": classifier_failed,
        "classifier_error": classifier_error,
        "summary": {
            "total_instances": len(decisions),
            "combined_eligible_instances": combined_eligible_count,
            "doppler_routed_instances": doppler_routed_count,
            "skip_reasons": dict(skip_counter),
        },
        "instances": decisions,
    }


