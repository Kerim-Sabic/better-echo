from __future__ import annotations

import logging
import os
from collections import Counter
from typing import Any, Dict, List, Optional

import pydicom
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.database_models.studies import Study
from app.helpers.doppler.doppler_tags import inspect_doppler_tags
from app.services.inference.secondary_analysis_service import (
    SecondaryAnalysisMemoryError,
    SecondaryAnalysisStudyTooLargeError,
    classify_views_for_study,
    unload_secondary_analysis_model,
)

logger = logging.getLogger(__name__)

# Part 0. Queue prefilter skip reason codes.
INCOMPATIBLE_DICOM = "INCOMPATIBLE_DICOM"
SPECTRAL_DOPPLER_TAG_ROUTED = "SPECTRAL_DOPPLER_TAG_ROUTED"
LOW_VIEW_CONFIDENCE = "LOW_VIEW_CONFIDENCE"
NO_TASK_MATCH = "NO_TASK_MATCH"
VIEW_CLASSIFIER_FAILED = "VIEW_CLASSIFIER_FAILED"


def _should_unload_after_stage() -> bool:
    return (
        str(settings.PIPELINE_UNLOAD_POLICY).strip().lower() == "stage"
        or str(settings.INFERENCE_PROFILE).strip().lower() == "low_vram"
    )


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
SPECTRAL_DOPPLER_PW_VIEW = "SPECTRAL_DOPPLER_PW"
SPECTRAL_DOPPLER_CW_VIEW = "SPECTRAL_DOPPLER_CW"
SPECTRAL_DOPPLER_VIEW = "SPECTRAL_DOPPLER"


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


def _spectral_view_label(subtype: Optional[str]) -> str:
    subtype_norm = (subtype or "").strip().lower()
    if subtype_norm == "pw":
        return SPECTRAL_DOPPLER_PW_VIEW
    if subtype_norm == "cw":
        return SPECTRAL_DOPPLER_CW_VIEW
    return SPECTRAL_DOPPLER_VIEW


def build_prefilter_routing_map(
    *,
    db: Session,
    study_uid: str,
    confidence_min: float,
) -> Dict[str, Any]:
    """
    Build routing decisions for queue stages with persisted skip reasons.
    """
    # Part 4. Ensure study exists and load study instances.
    study = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise ValueError("Study not found")

    instances: List[Instance] = (
        db.query(Instance)
        .join(Instance.series)
        .join(Series.study)
        .filter(Study.id == study.id)
        .all()
    )

    # Part 5. Run compatibility + Doppler tagging first, then classify only non-spectral targets.
    classifier_target_paths: List[str] = []
    precomputed_by_instance_id: Dict[int, Dict[str, Any]] = {}
    has_spectral_updates = False

    for instance in instances:
        is_compatible, compatibility_reason = _detect_hard_compatibility(instance)
        doppler_report: Dict[str, Any] = {}
        doppler_region = None
        doppler_subtype = None
        doppler_weights: List[str] = []
        is_spectral_routed = False

        if is_compatible:
            doppler_report = inspect_doppler_tags(instance.file_path)
            if bool(doppler_report.get("is_doppler_candidate")):
                details = doppler_report.get("details") or {}
                doppler_region = details.get("doppler_region")
                doppler_subtype = details.get("spectral_subtype")
                doppler_weights = _doppler_weights_for_subtype(doppler_subtype)
                is_spectral_routed = True

                spectral_view = _spectral_view_label(doppler_subtype)
                if (
                    instance.predicted_view != spectral_view
                    or float(instance.predicted_view_confidence or 0.0) != 1.0
                ):
                    instance.predicted_view = spectral_view
                    instance.predicted_view_confidence = 1.0
                    db.add(instance)
                    has_spectral_updates = True
            elif instance.file_path:
                classifier_target_paths.append(instance.file_path)

        precomputed_by_instance_id[instance.id] = {
            "is_compatible": is_compatible,
            "compatibility_reason": compatibility_reason,
            "doppler_region": doppler_region,
            "doppler_subtype": doppler_subtype,
            "doppler_weights": doppler_weights,
            "is_spectral_routed": is_spectral_routed,
        }

    if has_spectral_updates:
        db.commit()

    classifier_failed = False
    classifier_error = None
    if classifier_target_paths:
        classifier_target_paths = list(dict.fromkeys(classifier_target_paths))
        try:
            classify_views_for_study(
                study_uid,
                db,
                include_file_paths=classifier_target_paths,
            )
        except (SecondaryAnalysisMemoryError, SecondaryAnalysisStudyTooLargeError):
            logger.exception(
                "[PIPELINE_PREFILTER] View classifier failed with user-facing failure for study_uid=%s",
                study_uid,
            )
            raise
        except Exception as exc:
            classifier_failed = True
            classifier_error = str(exc)
            logger.exception(
                "[PIPELINE_PREFILTER] View classifier failed for study_uid=%s",
                study_uid,
            )
        finally:
            if _should_unload_after_stage():
                unload_secondary_analysis_model()

    # Part 6. Build final routing decisions.
    decisions: List[Dict[str, Any]] = []
    skip_counter = Counter()
    combined_eligible_count = 0
    doppler_routed_count = 0

    for instance in instances:
        combined_skip_reasons: List[str] = []
        dynamic_skip_reasons: List[str] = []

        precomputed = precomputed_by_instance_id.get(instance.id, {})
        is_compatible = bool(precomputed.get("is_compatible"))
        compatibility_reason = precomputed.get("compatibility_reason")
        if not is_compatible and compatibility_reason:
            combined_skip_reasons.append(compatibility_reason)
            dynamic_skip_reasons.append(compatibility_reason)
            skip_counter[compatibility_reason] += 1

        doppler_region = precomputed.get("doppler_region")
        doppler_subtype = precomputed.get("doppler_subtype")
        doppler_weights = precomputed.get("doppler_weights") or []
        is_spectral_routed = bool(precomputed.get("is_spectral_routed"))

        if is_spectral_routed:
            doppler_routed_count += 1
            combined_skip_reasons.append(SPECTRAL_DOPPLER_TAG_ROUTED)
            dynamic_skip_reasons.append(SPECTRAL_DOPPLER_TAG_ROUTED)
            skip_counter[SPECTRAL_DOPPLER_TAG_ROUTED] += 1

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
                "instance_number": instance.instance_number,
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


