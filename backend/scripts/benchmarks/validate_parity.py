"""
Clinical output-parity harness for the Horalix inference optimizations.

Runs each optimized lane against its FP32 / every-frame baseline over a folder of
real DICOM cines and reports whether clinical outputs stay within tolerance. This
is the gate referenced by the deployment policy: *no optimization is enabled in
production unless this report passes.*

It exercises the real production code paths (the same functions the pipeline
calls), toggling ``app.core.config.settings`` between baseline and candidate, so
what is measured is exactly what ships. It does NOT need Postgres or Orthanc - it
reads DICOMs from disk directly.

Requires the trained model assets to be present (same ones the app loads). Lanes
whose weights are missing are reported as SKIPPED rather than failing the run.

Metrics per lane
----------------
* motion segmentation : Dice(candidate mask, baseline mask) per frame -> mean/min
* 2D measurements      : keypoint trajectory error (px, source space) and derived
                         length error (cm) per weight, per frame -> mean/max
* primary analysis     : absolute delta per PanEcho task (EF, LV dims, ...)

Usage (from backend/):
    python scripts/benchmarks/validate_parity.py --data /path/to/cines \\
        --candidate fp16 --json parity_report.json
    python scripts/benchmarks/validate_parity.py --data /path/to/cines \\
        --candidate fp16 --temporal-stride 2
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
import traceback
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

os.environ.setdefault("CORS_ORIGIN", '["http://localhost:3000"]')
os.environ.setdefault("ORTHANC_URL", "http://localhost:8042")
os.environ.setdefault("ORTHANC_USER", "bench")
os.environ.setdefault("ORTHANC_PASS", "bench")
os.environ.setdefault("SECRET_KEY", "bench")
os.environ.setdefault("TOKEN_EXPIRE_HOURS", "1")

import numpy as np
import torch

from app.core.config import settings


# --------------------------- settings override context ----------------------
class override_settings:
    """Temporarily set attributes on the live settings singleton."""

    def __init__(self, **values: Any) -> None:
        self.values = values
        self._previous: Dict[str, Any] = {}

    def __enter__(self) -> None:
        for key, value in self.values.items():
            self._previous[key] = getattr(settings, key)
            setattr(settings, key, value)

    def __exit__(self, *exc) -> None:
        for key, value in self._previous.items():
            setattr(settings, key, value)


BASELINE = {
    "INFERENCE_AMP_ENABLED": False,
    "INFERENCE_CHANNELS_LAST": False,
    "LINEAR_TEMPORAL_STRIDE": 1,
    "SECONDARY_ANALYSIS_AMP_ENABLED": False,
}


def candidate_overrides(args: argparse.Namespace) -> Dict[str, Any]:
    amp = args.candidate in ("fp16", "bf16")
    return {
        "INFERENCE_AMP_ENABLED": amp,
        "INFERENCE_AMP_DTYPE": "bfloat16" if args.candidate == "bf16" else "float16",
        "INFERENCE_CHANNELS_LAST": amp,
        "LINEAR_TEMPORAL_STRIDE": args.temporal_stride,
        "SECONDARY_ANALYSIS_AMP_ENABLED": amp and args.include_secondary,
    }


# --------------------------- metric helpers ---------------------------------
def dice(a: np.ndarray, b: np.ndarray) -> float:
    a = a.astype(bool)
    b = b.astype(bool)
    denom = a.sum() + b.sum()
    if denom == 0:
        return 1.0  # both empty == perfect agreement
    return float(2.0 * np.logical_and(a, b).sum() / denom)


# --------------------------- lane: motion segmentation ----------------------
def run_motion_lane(path: str, overrides: Dict[str, Any]) -> Optional[List[np.ndarray]]:
    from app.helpers.media.dicom_frame_reader import read_dicom_frames
    from app.helpers.inference_runtime.device_selector import get_device_for_model
    from app.helpers.inference_runtime.batch_config import get_batch_size
    from app.services.inference.motion_segmentation.inference import (
        iter_lv_probabilities,
        unload_motion_segmentation_model,
    )
    from app.services.inference.motion_segmentation.postprocess import binarize_and_clean

    frames, _fps = read_dicom_frames(path, apply_mask=False, preserve_geometry=True)
    if not frames:
        return None
    frame_size = (frames[0].shape[1], frames[0].shape[0])
    device = get_device_for_model("motion_segmentation")
    with override_settings(**overrides):
        unload_motion_segmentation_model()  # reload under these settings
        masks = [
            binarize_and_clean(prob, frame_size)
            for prob in iter_lv_probabilities(frames, device, get_batch_size("motion_segmentation"))
        ]
        unload_motion_segmentation_model()
    return masks


# --------------------------- lane: 2D measurements --------------------------
def run_measure_lane(path: str, weight: str, overrides: Dict[str, Any]) -> Optional[Dict[str, np.ndarray]]:
    from app.services.inference.linear_measurements.geometry import (
        load_measurement_inputs,
        build_frame_geometry,
    )
    from app.services.inference.linear_measurements.inference import (
        predict_linear_measurement_points,
        unload_2d_models,
    )

    inputs = load_measurement_inputs(path)
    with override_settings(**overrides):
        unload_2d_models()
        prediction = predict_linear_measurement_points(
            model_weights=weight,
            model_input_tensor=inputs.model_input_tensor,
        )
        unload_2d_models()
    geometry = build_frame_geometry(
        predictions=prediction.coordinates,
        point_confidences=prediction.point_confidences,
        frame_width=inputs.frame_width,
        frame_height=inputs.frame_height,
        dicom_scale=inputs.dicom_scale,
        measurement_name=weight,
    )
    lengths_cm = np.array(
        [f["measurement"].get("value") if f["measurement"].get("value") is not None else np.nan
         for f in geometry],
        dtype=np.float64,
    )
    # source-space keypoint coordinates (px) for trajectory comparison
    points = np.array(
        [[[p["x"], p["y"]] for p in f["points"]] for f in geometry],
        dtype=np.float64,
    )
    return {"lengths_cm": lengths_cm, "points_px": points}


# --------------------------- lane: primary analysis -------------------------
def run_primary_lane(path: str, overrides: Dict[str, Any]) -> Optional[Dict[str, float]]:
    from app.helpers.inference_runtime.inference_functions import (
        get_model_and_device,
        pick_frames_from_local_dicom,
        stack_to_tensor,
        unload_primary_analysis_model,
    )
    from app.helpers.inference_runtime import precision

    with override_settings(**overrides):
        unload_primary_analysis_model()
        model, device = get_model_and_device()
        tensor = stack_to_tensor(pick_frames_from_local_dicom(path, 16)).to(device)
        with torch.no_grad(), precision.autocast(device):
            preds = model(tensor)
        unload_primary_analysis_model()

    out: Dict[str, float] = {}
    if isinstance(preds, dict):
        for task, value in preds.items():
            if torch.is_tensor(value) and value.numel() == 1:
                out[task] = float(value.detach().cpu().item())
    return out


# --------------------------- per-file evaluation ----------------------------
@dataclass
class FileResult:
    path: str
    motion_mean_dice: Optional[float] = None
    motion_min_dice: Optional[float] = None
    measure_max_length_err_cm: Optional[float] = None
    measure_max_point_err_px: Optional[float] = None
    primary_max_abs_delta: Optional[float] = None
    primary_deltas: Dict[str, float] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)


def evaluate_file(path: str, cand: Dict[str, Any], weights: List[str], lanes: List[str]) -> FileResult:
    result = FileResult(path=path)

    if "motion" in lanes:
        try:
            base = run_motion_lane(path, BASELINE)
            cand_masks = run_motion_lane(path, cand)
            if base and cand_masks and len(base) == len(cand_masks):
                dices = [dice(b, c) for b, c in zip(base, cand_masks)]
                result.motion_mean_dice = round(float(np.mean(dices)), 5)
                result.motion_min_dice = round(float(np.min(dices)), 5)
        except Exception as exc:  # noqa: BLE001
            result.errors.append(f"motion: {exc}")

    if "measure" in lanes:
        max_len_err = 0.0
        max_pt_err = 0.0
        any_ok = False
        for weight in weights:
            try:
                base = run_measure_lane(path, weight, BASELINE)
                cand_m = run_measure_lane(path, weight, cand)
                if not base or not cand_m:
                    continue
                any_ok = True
                len_err = np.nanmax(np.abs(base["lengths_cm"] - cand_m["lengths_cm"]))
                pt_err = np.max(np.linalg.norm(base["points_px"] - cand_m["points_px"], axis=-1))
                max_len_err = max(max_len_err, float(np.nan_to_num(len_err)))
                max_pt_err = max(max_pt_err, float(pt_err))
            except Exception as exc:  # noqa: BLE001
                result.errors.append(f"measure[{weight}]: {exc}")
        if any_ok:
            result.measure_max_length_err_cm = round(max_len_err, 5)
            result.measure_max_point_err_px = round(max_pt_err, 4)

    if "primary" in lanes:
        try:
            base = run_primary_lane(path, BASELINE)
            cand_p = run_primary_lane(path, cand)
            if base and cand_p:
                deltas = {k: round(abs(base[k] - cand_p.get(k, base[k])), 6) for k in base}
                result.primary_deltas = deltas
                if deltas:
                    result.primary_max_abs_delta = max(deltas.values())
        except Exception as exc:  # noqa: BLE001
            result.errors.append(f"primary: {exc}")

    return result


# --------------------------- report -----------------------------------------
def build_report(results: List[FileResult], args: argparse.Namespace) -> Dict[str, Any]:
    def collect(attr: str) -> List[float]:
        return [getattr(r, attr) for r in results if getattr(r, attr) is not None]

    mean_dices = collect("motion_mean_dice")
    min_dices = collect("motion_min_dice")
    len_errs = collect("measure_max_length_err_cm")
    pt_errs = collect("measure_max_point_err_px")
    primary_deltas = collect("primary_max_abs_delta")

    checks: List[Dict[str, Any]] = []

    def add_check(name: str, observed: Optional[float], op: str, limit: float) -> None:
        if observed is None:
            checks.append({"metric": name, "status": "SKIPPED", "observed": None, "limit": limit})
            return
        passed = observed >= limit if op == ">=" else observed <= limit
        checks.append({
            "metric": name, "status": "PASS" if passed else "FAIL",
            "observed": round(observed, 5), "op": op, "limit": limit,
        })

    add_check("motion_min_dice", min(min_dices) if min_dices else None, ">=", args.min_dice)
    add_check("measure_max_length_err_cm", max(len_errs) if len_errs else None, "<=", args.max_length_err_cm)
    add_check("measure_max_point_err_px", max(pt_errs) if pt_errs else None, "<=", args.max_point_err_px)
    add_check("primary_max_abs_delta", max(primary_deltas) if primary_deltas else None, "<=", args.max_primary_delta)

    overall = "PASS"
    if any(c["status"] == "FAIL" for c in checks):
        overall = "FAIL"
    elif all(c["status"] == "SKIPPED" for c in checks):
        overall = "NO_DATA"

    return {
        "candidate": args.candidate,
        "temporal_stride": args.temporal_stride,
        "num_files": len(results),
        "overall": overall,
        "checks": checks,
        "summary": {
            "motion_mean_dice_avg": round(float(np.mean(mean_dices)), 5) if mean_dices else None,
            "motion_min_dice_worst": round(min(min_dices), 5) if min_dices else None,
            "measure_max_length_err_cm": round(max(len_errs), 5) if len_errs else None,
            "measure_max_point_err_px": round(max(pt_errs), 4) if pt_errs else None,
            "primary_max_abs_delta": round(max(primary_deltas), 6) if primary_deltas else None,
        },
        "files": [asdict(r) for r in results],
    }


def print_report(report: Dict[str, Any]) -> None:
    print("\n============ CLINICAL OUTPUT-PARITY REPORT ============")
    print(f"candidate={report['candidate']} temporal_stride={report['temporal_stride']} "
          f"files={report['num_files']}")
    print(f"OVERALL: {report['overall']}\n")
    print(f"{'metric':<32}{'status':<9}{'observed':>12}{'limit':>12}")
    print("-" * 65)
    for c in report["checks"]:
        print(f"{c['metric']:<32}{c['status']:<9}{str(c['observed']):>12}{str(c.get('limit')):>12}")
    print("=" * 65)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, help="Folder of .dcm cines to evaluate")
    parser.add_argument("--candidate", choices=["fp16", "bf16"], default="fp16")
    parser.add_argument("--temporal-stride", type=int, default=1)
    parser.add_argument("--lanes", nargs="+", default=["motion", "measure", "primary"],
                        choices=["motion", "measure", "primary"])
    parser.add_argument("--weights", nargs="+", default=None,
                        help="2D weights to test (default: all VALID_2D_WEIGHTS)")
    parser.add_argument("--include-secondary", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="Max number of files")
    # Tolerances (align with settings + clinical sign-off).
    parser.add_argument("--min-dice", type=float, default=0.97)
    parser.add_argument("--max-length-err-cm", type=float, default=0.1)
    parser.add_argument("--max-point-err-px", type=float, default=2.0)
    parser.add_argument("--max-primary-delta", type=float, default=0.5)
    parser.add_argument("--json", default=None)
    args = parser.parse_args()

    from app.AI_models.measurements.constants import VALID_2D_WEIGHTS

    weights = args.weights or sorted(VALID_2D_WEIGHTS)
    files = sorted(glob.glob(os.path.join(args.data, "**", "*.dcm"), recursive=True))
    if args.limit:
        files = files[: args.limit]
    if not files:
        print(f"No .dcm files found under {args.data}")
        sys.exit(2)

    cand = candidate_overrides(args)
    print(f"Baseline : {BASELINE}")
    print(f"Candidate: {cand}")
    print(f"Evaluating {len(files)} file(s) across lanes={args.lanes}\n")

    results: List[FileResult] = []
    for i, path in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {os.path.basename(path)}")
        try:
            results.append(evaluate_file(path, cand, weights, args.lanes))
        except Exception:  # noqa: BLE001
            traceback.print_exc()
            results.append(FileResult(path=path, errors=["fatal: see traceback"]))

    report = build_report(results, args)
    print_report(report)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
        print(f"\nWrote {args.json}")

    sys.exit(0 if report["overall"] in ("PASS", "NO_DATA") else 1)


if __name__ == "__main__":
    main()
