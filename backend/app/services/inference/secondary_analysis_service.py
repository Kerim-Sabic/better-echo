import logging
import os
import tempfile
import threading
import time
import shutil
from typing import Any, Callable, Dict, Iterable, List, Optional

import requests
import torch
from sqlalchemy.orm import Session

from app.core.artifacts import (
    SECONDARY_ANALYSIS_MODEL_NAME,
    SECONDARY_ANALYSIS_TYPE,
    UPLOAD_DIR,
)
from app.core.config import settings
from app.core.runtime_paths import ensure_model_assets_available
from app.database_models.derived_results import DerivedResult
from app.database_models.instances import Instance
from app.database_models.series import Series
from app.database_models.studies import Study
from app.helpers.inference_runtime import precision
from app.helpers.inference_runtime.inference_functions import fetch_orthanc_instance_ids_from_study
from app.helpers.media.frame_cache import StudyFrameCache, get_study_frame_cache

_SECONDARY_AMP_SETTING = "SECONDARY_ANALYSIS_AMP_ENABLED"

orthanc_url = settings.ORTHANC_URL
orthanc_user = settings.ORTHANC_USER
orthanc_pass = settings.ORTHANC_PASS

logger = logging.getLogger(__name__)

SECONDARY_ANALYSIS_STUDY_TOO_LARGE = "SECONDARY_ANALYSIS_STUDY_TOO_LARGE"
MEMORY_LIMIT_EXCEEDED = "MEMORY_LIMIT_EXCEEDED"


_ep: Optional[Any] = None
_ep_lock = threading.Lock()
_preload_thread: Optional[threading.Thread] = None


class SecondaryAnalysisStudyTooLargeError(RuntimeError):
    pass


class SecondaryAnalysisMemoryError(RuntimeError):
    pass


def _positive_int(value: object, fallback: int) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = fallback
    return max(parsed, 1)


def _chunked(items: List[Any], chunk_size: int) -> Iterable[List[Any]]:
    for start in range(0, len(items), chunk_size):
        yield items[start:start + chunk_size]


def _enforce_secondary_instance_limit(count: int) -> None:
    max_instances = _positive_int(settings.SECONDARY_ANALYSIS_MAX_INSTANCES, 100)
    if count > max_instances:
        raise SecondaryAnalysisStudyTooLargeError(
            f"{SECONDARY_ANALYSIS_STUDY_TOO_LARGE}: "
            f"This study has {count} EchoPrime-eligible DICOM files, but the configured limit is "
            f"{max_instances}. Please retry with a smaller study."
        )


def _is_memory_exception(exc: BaseException) -> bool:
    torch_oom_error = getattr(torch.cuda, "OutOfMemoryError", None)
    if isinstance(exc, MemoryError):
        return True
    if torch_oom_error is not None and isinstance(exc, torch_oom_error):
        return True
    return "out of memory" in str(exc).lower()


def _raise_memory_normalized(exc: BaseException) -> None:
    if _is_memory_exception(exc):
        raise SecondaryAnalysisMemoryError(
            f"{MEMORY_LIMIT_EXCEEDED}: Secondary analysis exceeded available memory. "
            "Please retry with a smaller study."
        ) from exc
    raise exc


def _clear_torch_cache() -> None:
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


# Part 1. Secondary analysis model lifecycle helpers.
def get_secondary_analysis_model() -> Any:
    global _ep
    if _ep is not None:
        return _ep
    with _ep_lock:
        if _ep is None:
            ensure_model_assets_available(
                "secondary_analysis",
                ("repo_root", "encoder_checkpoint", "view_classifier_checkpoint"),
            )
            from app.AI_models.EchoPrime.echo_prime import EchoPrime
            from app.helpers.inference_runtime.device_selector import get_device_for_model

            start = time.time()
            # Honor SECONDARY_ANALYSIS_DEVICE (and reserved-device avoidance)
            # instead of EchoPrime's own unconditional cuda:0 default.
            _ep = EchoPrime(device=get_device_for_model("secondary_analysis"))
            device = getattr(_ep, "device", None)
            logger.info("[SecondaryAnalysis] Model initialized on device=%s in %.1fs", device, time.time() - start)
    return _ep


def _warmup_secondary_analysis(ep: Any) -> None:
    try:
        dummy = torch.zeros((1, 3, 16, 224, 224), device=ep.device)
        with torch.no_grad():
            _ = ep.echo_encoder(dummy)
            _ = ep.view_classifier(dummy[:, :, 0, :, :])
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        logger.info("[SecondaryAnalysis] Warmup completed")
    except Exception as exc:
        logger.warning("[SecondaryAnalysis] Warmup skipped due to error: %s", exc)


def preload_secondary_analysis(warmup: bool = False) -> Optional[Any]:
    try:
        start = time.time()
        ep = get_secondary_analysis_model()
        if warmup:
            _warmup_secondary_analysis(ep)
        device = getattr(ep, "device", None)
        logger.info("[SecondaryAnalysis] Preload finished (warmup=%s, device=%s) in %.1fs", warmup, device, time.time() - start)
        return ep
    except Exception as exc:
        logger.warning("[SecondaryAnalysis] Preload failed; will fallback to lazy load: %s", exc)
        return None


def _run_async(task: Callable[[], None]) -> None:
    global _preload_thread
    if _preload_thread and _preload_thread.is_alive():
        return
    _preload_thread = threading.Thread(target=task, name="secondary-analysis-preload", daemon=True)
    _preload_thread.start()


def start_secondary_analysis_preload_background(warmup: bool = False) -> None:
    _run_async(lambda: preload_secondary_analysis(warmup))


def unload_secondary_analysis_model() -> None:
    global _ep
    with _ep_lock:
        if _ep is None:
            return
        del _ep
        _ep = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        import gc
        gc.collect()
        logger.info("[SecondaryAnalysis] Model unloaded and memory cleared")


# Part 2. Study input download and subset-build helpers.
def download_dicoms_for_instances(instance_ids: List[str], output_dir: str) -> List[Dict[str, str]]:
    records: List[Dict[str, str]] = []
    for idx, iid in enumerate(instance_ids):
        response = requests.get(
            f"{orthanc_url}/instances/{iid}/file",
            auth=(orthanc_user, orthanc_pass),
            stream=True,
        )
        response.raise_for_status()
        filepath = os.path.join(output_dir, f"{idx:05d}_{iid}.dcm")
        with open(filepath, "wb") as output_file:
            for chunk in response.iter_content(chunk_size=8192):
                output_file.write(chunk)
        records.append({"instance_id": iid, "path": filepath})
    return records


def download_dicoms_for_study(instance_ids: List[str]) -> List[Dict[str, str]]:
    """
    Download all DICOMs for a study into a temporary folder.
    Returns a list of dicts with instance_id and local path.
    """
    tmp_dir = tempfile.mkdtemp(prefix="secondary_analysis_study_")
    return download_dicoms_for_instances(instance_ids, tmp_dir)


ECHOPRIME_CLIP_RECIPE = "echoprime_clip"


def _cached_echoprime_clip(
    ep: Any,
    cache: StudyFrameCache,
    dicom_path: str,
) -> Optional[torch.Tensor]:
    def _factory(decoded):
        if decoded.required_force:
            # EchoPrime historically rejects files that need force-parsing;
            # preserve that behavior so the cached clip matches direct output.
            return None
        return ep.process_pixel_array(decoded.pixel_array, source=decoded.key)

    try:
        return cache.get_derived(dicom_path, ECHOPRIME_CLIP_RECIPE, _factory)
    except Exception as exc:
        logger.warning(
            "[SecondaryAnalysis] Skipping unreadable DICOM %s: %s", dicom_path, exc
        )
        return None


def _stack_processed_dicoms(
    ep: Any,
    dicom_paths: List[str],
    cache: Optional[StudyFrameCache] = None,
) -> tuple[torch.Tensor, List[str]]:
    clips = []
    processed_paths = []
    use_cache = cache is not None and callable(getattr(ep, "process_pixel_array", None))
    for dicom_path in dicom_paths:
        if use_cache:
            clip = _cached_echoprime_clip(ep, cache, dicom_path)
        else:
            clip = ep.process_dicom_file(dicom_path)
        if clip is None:
            continue
        clips.append(clip)
        processed_paths.append(dicom_path)

    if not clips:
        empty = torch.empty((0, 3, 16, 224, 224), dtype=torch.float32)
        return empty, processed_paths

    return torch.stack(clips), processed_paths


def _local_file_paths_for_orthanc_ids(
    *,
    db: Session,
    study_uid: str,
    orthanc_instance_ids: List[str],
) -> Dict[str, str]:
    """Map Orthanc instance IDs to on-disk DICOM paths for this study."""
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


def _local_study_instance_paths(
    *,
    db: Session,
    study_uid: str,
) -> tuple[Dict[str, str], int]:
    """
    Resolve every registered instance of a study to its on-disk DICOM path.

    Returns (orthanc_id -> existing local path, total registered instances).
    The instance list can replace the Orthanc HTTP listing only when every
    registered instance has a file on disk (fully-local study).
    """
    rows = (
        db.query(Instance.instance_orthanc_id, Instance.file_path)
        .join(Instance.series)
        .join(Series.study)
        .filter(Study.study_uid == study_uid)
        .order_by(Instance.id.asc())
        .all()
    )
    local = {
        orthanc_id: file_path
        for orthanc_id, file_path in rows
        if orthanc_id and file_path and os.path.exists(file_path)
    }
    return local, len(rows)


def _execution_path_label(local_count: int, total_count: int) -> str:
    if total_count > 0 and local_count == total_count:
        return "local"
    if local_count == 0:
        return "orthanc"
    return "mixed"


# Part 3. Secondary analysis metrics inference service entrypoint.
def run_secondary_analysis_metrics(
    *,
    study_uid: str,
    db: Session,
    include_instance_orthanc_ids: Optional[List[str]] = None,
    artifact_set_id: Optional[int] = None,
) -> Dict[str, object]:
    logger.info("[SecondaryAnalysis] infer called with study_uid=%s", study_uid)

    # Part 3.1 Local-first instance resolution.
    # Priority: local file path -> decode -> inference. The Orthanc HTTP
    # listing/download path is only used for instances missing on disk.
    if include_instance_orthanc_ids:
        instance_orthanc_ids = list(include_instance_orthanc_ids)
        local_path_by_orthanc_id = _local_file_paths_for_orthanc_ids(
            db=db,
            study_uid=study_uid,
            orthanc_instance_ids=instance_orthanc_ids,
        )
    else:
        local_map, registered_count = _local_study_instance_paths(
            db=db, study_uid=study_uid
        )
        if registered_count > 0 and len(local_map) == registered_count:
            # Fully-local study: the DB instance list stands in for the
            # Orthanc listing, so no HTTP request is needed at all.
            instance_orthanc_ids = list(local_map.keys())
            local_path_by_orthanc_id = local_map
        else:
            instance_orthanc_ids = fetch_orthanc_instance_ids_from_study(study_uid)
            local_path_by_orthanc_id = _local_file_paths_for_orthanc_ids(
                db=db,
                study_uid=study_uid,
                orthanc_instance_ids=instance_orthanc_ids,
            )

    if not instance_orthanc_ids:
        raise ValueError(f"No instances found for study_uid={study_uid}")
    _enforce_secondary_instance_limit(len(instance_orthanc_ids))

    execution_path = _execution_path_label(
        len(local_path_by_orthanc_id), len(instance_orthanc_ids)
    )
    logger.info(
        "[SecondaryAnalysis] Execution path selected | study_uid=%s path=%s local_instances=%d/%d",
        study_uid,
        execution_path,
        len(local_path_by_orthanc_id),
        len(instance_orthanc_ids),
    )

    ep = get_secondary_analysis_model()
    metrics_chunk_size = _positive_int(settings.SECONDARY_ANALYSIS_METRICS_CHUNK_SIZE, 8)
    encoder_batch_size = _positive_int(settings.SECONDARY_ANALYSIS_ENCODER_BATCH, 4)
    chunk_dirs: List[str] = []

    # Reuse any frames already decoded during prefilter for local files.
    frame_cache = get_study_frame_cache(study_uid)

    try:
        metrics_accumulator = ep.create_metrics_accumulator()
        processed_instances = 0

        for chunk_ids in _chunked(instance_orthanc_ids, metrics_chunk_size):
            chunk_paths = [
                local_path_by_orthanc_id[iid]
                for iid in chunk_ids
                if iid in local_path_by_orthanc_id
            ]
            remote_ids = [iid for iid in chunk_ids if iid not in local_path_by_orthanc_id]
            chunk_dir: Optional[str] = None
            if remote_ids:
                chunk_dir = tempfile.mkdtemp(prefix="secondary_analysis_metrics_chunk_")
                chunk_dirs.append(chunk_dir)
                downloaded = download_dicoms_for_instances(remote_ids, chunk_dir)
                chunk_paths.extend(record["path"] for record in downloaded)
            stack_of_videos, _processed_paths = _stack_processed_dicoms(
                ep,
                chunk_paths,
                cache=frame_cache,
            )

            if stack_of_videos.shape[0] > 0:
                with precision.autocast(
                    getattr(ep, "device", None), setting_name=_SECONDARY_AMP_SETTING
                ):
                    metrics_accumulator = ep.accumulate_metrics_chunk(
                        metrics_accumulator,
                        stack_of_videos,
                        encoder_batch_size=encoder_batch_size,
                        visualize=False,
                    )
                processed_instances += int(stack_of_videos.shape[0])

            del stack_of_videos
            _clear_torch_cache()
            if chunk_dir is not None:
                shutil.rmtree(chunk_dir, ignore_errors=True)
                chunk_dirs.remove(chunk_dir)

        if processed_instances <= 0:
            raise ValueError("No EchoPrime-compatible DICOM instances found for secondary analysis.")

        predictions = ep.predict_metrics_from_accumulator(metrics_accumulator)

        study = db.query(Study).filter(Study.study_uid == study_uid).first()
        if study:
            if artifact_set_id is not None:
                report_row = (
                    db.query(DerivedResult)
                    .filter(
                        DerivedResult.study_id == study.id,
                        DerivedResult.type == SECONDARY_ANALYSIS_TYPE,
                        DerivedResult.artifact_set_id == artifact_set_id,
                    )
                    .first()
                )
                if not report_row:
                    report_row = DerivedResult(
                        study_id=study.id,
                        type=SECONDARY_ANALYSIS_TYPE,
                        model_name=SECONDARY_ANALYSIS_MODEL_NAME,
                        model_version="v1",
                        artifact_set_id=artifact_set_id,
                    )
                    db.add(report_row)
            else:
                report_row = DerivedResult(
                    study_id=study.id,
                    type=SECONDARY_ANALYSIS_TYPE,
                    model_name=SECONDARY_ANALYSIS_MODEL_NAME,
                    model_version="v1",
                )
                db.add(report_row)

            report_row.value_json = {"predictions": predictions}
            db.commit()
            db.refresh(report_row)

        logger.info(
            "[SecondaryAnalysis] Metrics inference completed for study_uid=%s (execution_path=%s)",
            study_uid,
            execution_path,
        )
        return {
            "study_uid": study_uid,
            "num_instances": processed_instances,
            "predictions": predictions,
            "execution_path": execution_path,
        }
    except Exception as exc:
        _raise_memory_normalized(exc)
    finally:
        for chunk_dir in list(chunk_dirs):
            shutil.rmtree(chunk_dir, ignore_errors=True)


# Part 4. Secondary analysis view-classification service entrypoint.
def classify_views_for_study(
    study_uid: str,
    db: Session,
    include_file_paths: Optional[List[str]] = None,
) -> Dict[str, Dict[str, Optional[float | str]]]:
    """
    Use the secondary analysis view classifier to tag instances in a study.

    When include_file_paths is provided, only that subset is classified and persisted.
    Returns a mapping of SOPInstanceUID -> {view, confidence, file_path}.
    """
    study_folder = os.path.join(UPLOAD_DIR, study_uid)
    if not os.path.isdir(study_folder):
        raise FileNotFoundError(f"Study folder not found: {study_folder}")

    study = db.query(Study).filter(Study.study_uid == study_uid).first()
    if not study:
        raise ValueError(f"Study not found in DB: {study_uid}")

    all_instances = (
        db.query(Instance)
        .join(Instance.series)
        .join(Series.study)
        .filter(Study.id == study.id)
        .all()
    )
    instances_by_path: Dict[str, Instance] = {
        os.path.abspath(row.file_path): row for row in all_instances if row.file_path
    }

    target_paths_set = (
        {os.path.abspath(path) for path in include_file_paths if path}
        if include_file_paths
        else None
    )
    target_instances = [
        instance for path, instance in instances_by_path.items() if (target_paths_set is None or path in target_paths_set)
    ]

    # Part 4.1 Reuse persisted classifier output when target instances already have predictions.
    if target_instances and all(instance.predicted_view for instance in target_instances):
        result_map: Dict[str, Dict[str, Optional[float | str]]] = {}
        for instance in target_instances:
            result_map[instance.sop_instance_uid] = {
                "view": instance.predicted_view,
                "confidence": instance.predicted_view_confidence,
                "file_path": instance.file_path,
            }
        logger.info(
            "[view_classifier] Using cached views for %d/%d instances in study %s",
            len(result_map),
            len(target_instances),
            study_uid,
        )
        return result_map

    study_disk_files = [
        os.path.abspath(os.path.join(study_folder, filename))
        for filename in sorted(os.listdir(study_folder))
        if os.path.isfile(os.path.join(study_folder, filename))
    ]
    if not study_disk_files:
        raise FileNotFoundError(f"No DICOM files found in {study_folder}")

    disk_files = (
        [path for path in study_disk_files if path in target_paths_set]
        if target_paths_set is not None
        else study_disk_files
    )
    if not disk_files:
        return {}
    _enforce_secondary_instance_limit(len(disk_files))

    ep = get_secondary_analysis_model()
    classify_chunk_size = _positive_int(settings.SECONDARY_ANALYSIS_CLASSIFY_CHUNK_SIZE, 8)
    frame_cache = get_study_frame_cache(study_uid)
    result_map: Dict[str, Dict[str, Optional[float | str]]] = {}
    try:
        for chunk_paths in _chunked(disk_files, classify_chunk_size):
            stack_of_videos, processed_paths = _stack_processed_dicoms(
                ep,
                chunk_paths,
                cache=frame_cache,
            )
            if stack_of_videos.shape[0] == 0:
                continue

            with precision.autocast(
                getattr(ep, "device", None), setting_name=_SECONDARY_AMP_SETTING
            ):
                view_list, view_confidence_list = ep.get_views(
                    stack_of_videos,
                    visualize=False,
                    return_view_list=True,
                    return_scores=True,
                )

            prediction_count = len(view_list)
            if prediction_count != len(processed_paths):
                logger.warning(
                    "[view_classifier] Mismatch for study %s: %d predictions vs %d files in chunk",
                    study_uid,
                    prediction_count,
                    len(processed_paths),
                )

            # Part 4.2 Persist predictions to matching Instance rows.
            limit = min(prediction_count, len(processed_paths))
            for idx, file_path in enumerate(processed_paths[:limit]):
                instance = instances_by_path.get(file_path)
                if not instance:
                    continue
                label = view_list[idx]
                confidence = float(view_confidence_list[idx]) if idx < len(view_confidence_list) else None
                instance.predicted_view = str(label).upper() if label else None
                instance.predicted_view_confidence = confidence
                db.add(instance)
                result_map[instance.sop_instance_uid] = {
                    "view": instance.predicted_view,
                    "confidence": confidence,
                    "file_path": file_path,
                }

            del stack_of_videos
            _clear_torch_cache()
    except Exception as exc:
        _raise_memory_normalized(exc)

    db.commit()
    logger.info(
        "[view_classifier] Saved views for %d/%d instances in study %s",
        len(result_map),
        len(target_instances) if target_paths_set is not None else len(all_instances),
        study_uid,
    )
    return result_map
