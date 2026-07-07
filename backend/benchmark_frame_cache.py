"""
Benchmark: per-study decoded frame cache vs direct per-consumer decoding.

Replays the analysis pipeline's decode + preprocessing call sequence over a
synthetic echo study using the real production helpers:

  prefilter   -> EchoPrime clip per cine (view classification)
  combined    -> EchoPrime clip again (metrics) + PanEcho tensor per cine
  dynamic     -> motion-segmentation frames (A4C), 8x linear measurement
                 weights (PLAX), 5x Doppler weights (spectral)

Model inference itself is excluded (weights are not shipped with the repo);
the stand-in EchoPrime preprocessing reproduces the per-frame crop/resize/
normalize cost. Cines are RLE-compressed so decode cost is representative.

Run from backend/:  python benchmark_frame_cache.py [--instances N] [--frames F]
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
import time
from typing import Dict, List

os.environ.setdefault("CORS_ORIGIN", '["http://localhost:3000"]')
os.environ.setdefault("ORTHANC_URL", "http://localhost:8042")
os.environ.setdefault("ORTHANC_USER", "bench")
os.environ.setdefault("ORTHANC_PASS", "bench")
os.environ.setdefault("SECRET_KEY", "bench")
os.environ.setdefault("TOKEN_EXPIRE_HOURS", "1")

import cv2
import numpy as np
import pydicom
import torch
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, RLELossless, generate_uid

from app.helpers.inference_runtime.inference_functions import (
    cached_panecho_tensor,
    pick_frames_from_local_dicom,
    stack_to_tensor,
)
from app.helpers.media.dicom_frame_reader import read_dicom_frames
from app.helpers.media.frame_cache import StudyFrameCache
from app.services.inference.linear_measurements.geometry import load_measurement_inputs
from app.services.inference.secondary_analysis_service import _stack_processed_dicoms
from app.services.inference.spectral_measurements.geometry import load_doppler_inputs

US_MULTIFRAME_SOP_CLASS = "1.2.840.10008.5.1.4.1.1.3.1"
WEIGHTS_2D = ["aorta", "aortic_root", "ivc", "ivs", "la", "lvid", "lvpw", "pa"]
WEIGHTS_DOPPLER = ["lvotvmax", "latevel", "medevel", "mvpeak_2c", "tapse_2c"]


class BenchEchoPrime:
    """EchoPrime-preprocessing stand-in with faithful per-frame cost."""

    frames_to_take = 16
    video_size = 224

    def process_pixel_array(self, raw_pixels, source="pixel_array"):
        pixels = np.asarray(raw_pixels)
        if pixels.ndim == 3:
            pixels = np.repeat(pixels[..., None], 3, axis=3)
        indices = (
            np.linspace(0, len(pixels) - 1, self.frames_to_take).round().astype(int)
        )
        clip = np.empty(
            (self.frames_to_take, self.video_size, self.video_size, 3),
            dtype=np.float32,
        )
        for out_idx, src_idx in enumerate(indices):
            clip[out_idx] = cv2.resize(
                pixels[src_idx],
                (self.video_size, self.video_size),
                interpolation=cv2.INTER_CUBIC,
            ).astype(np.float32)
        tensor = torch.as_tensor(clip).permute([3, 0, 1, 2])
        tensor = (tensor - 29.0) / 47.0
        return tensor

    def process_dicom_file(self, dicom_path):
        ds = pydicom.dcmread(dicom_path)
        return self.process_pixel_array(ds.pixel_array, source=dicom_path)


def write_cine(path: str, *, frames: int, rows: int, cols: int, seed: int) -> None:
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = US_MULTIFRAME_SOP_CLASS
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = FileDataset(path, {}, file_meta=meta, preamble=b"\0" * 128)
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    ds.SOPClassUID = US_MULTIFRAME_SOP_CLASS
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.Modality = "US"
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.SamplesPerPixel = 1
    ds.NumberOfFrames = frames
    ds.Rows = rows
    ds.Columns = cols
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.CineRate = 30

    rng = np.random.default_rng(seed)
    # Structured content (gradient + speckle) so RLE compresses realistically.
    base = np.linspace(0, 180, rows, dtype=np.uint8)[:, None]
    pixels = np.clip(
        base[None, :, :]
        + rng.integers(0, 60, size=(frames, rows, cols), dtype=np.uint8),
        0,
        255,
    ).astype(np.uint8)
    try:
        ds.compress(RLELossless, pixels)
    except Exception:
        ds.PixelData = pixels.tobytes()
    ds.save_as(path)


def build_study(root: str, num_instances: int, frames: int) -> Dict[str, List[str]]:
    """Synthesize a study: ~1/2 PLAX, ~1/3 A4C, remainder Doppler."""
    plax, a4c, doppler = [], [], []
    for idx in range(num_instances):
        path = os.path.join(root, f"cine_{idx:03d}.dcm")
        write_cine(path, frames=frames, rows=600, cols=800, seed=idx)
        bucket = idx % 6
        if bucket in (0, 1, 2):
            plax.append(path)
        elif bucket in (3, 4):
            a4c.append(path)
        else:
            doppler.append(path)
    return {"plax": plax, "a4c": a4c, "doppler": doppler}


def run_pipeline(study: Dict[str, List[str]], cache: StudyFrameCache | None) -> dict:
    """Replay the pipeline's decode/preprocess sequence; return outputs + timing."""
    ep = BenchEchoPrime()
    non_doppler = study["plax"] + study["a4c"]
    doppler_region = {"y0": 300, "y1": 599, "x0": 0, "x1": 799}
    outputs: dict = {}

    started = time.perf_counter()

    # Stage 1: prefilter -> view classification clips over non-Doppler cines.
    clips_stack, _ = _stack_processed_dicoms(ep, non_doppler, cache=cache)
    outputs["view_clips"] = clips_stack

    # Stage 2a: combined -> EchoPrime metrics re-processes the same cines.
    metrics_stack, _ = _stack_processed_dicoms(ep, non_doppler, cache=cache)
    outputs["metrics_clips"] = metrics_stack

    # Stage 2b: combined -> PanEcho tensor per eligible cine.
    panecho = []
    for path in non_doppler:
        if cache is not None:
            panecho.append(cached_panecho_tensor(cache, path, 16))
        else:
            panecho.append(stack_to_tensor(pick_frames_from_local_dicom(path, 16)))
    outputs["panecho"] = torch.cat(panecho, dim=0)

    # Stage 3a: dynamic -> motion segmentation frames for A4C cines.
    motion = []
    for path in study["a4c"]:
        frames, fps = read_dicom_frames(
            path, apply_mask=False, preserve_geometry=True, cache=cache
        )
        motion.append((len(frames), fps, frames[0].sum()))
    outputs["motion"] = motion

    # Stage 3b: dynamic -> 8 linear weights per PLAX cine (weight-major loop).
    linear_checksums = []
    for _weight in WEIGHTS_2D:
        for path in study["plax"]:
            inputs = load_measurement_inputs(path, cache=cache)
            linear_checksums.append(
                (inputs.frame_width, inputs.frame_height, len(inputs.model_frames_bgr))
            )
    outputs["linear"] = linear_checksums

    # Stage 3c: dynamic -> 5 Doppler weights per spectral cine.
    doppler_checksums = []
    for _weight in WEIGHTS_DOPPLER:
        for path in study["doppler"]:
            inputs = load_doppler_inputs(
                input_path=path, region_override=doppler_region, cache=cache
            )
            doppler_checksums.append(
                (
                    inputs.frame_selection["selected_frame_index"],
                    int(inputs.image_rgb.sum()),
                )
            )
    outputs["doppler"] = doppler_checksums

    outputs["elapsed_s"] = time.perf_counter() - started
    return outputs


def count_full_decodes(fn):
    """Run fn while counting full-pixel pydicom decodes."""
    counter = {"count": 0}
    original = pydicom.dcmread

    def counting(*args, **kwargs):
        if not kwargs.get("stop_before_pixels"):
            counter["count"] += 1
        return original(*args, **kwargs)

    pydicom.dcmread = counting
    # The frame cache module holds its own reference.
    import app.helpers.media.frame_cache as fc_module

    fc_module.pydicom.dcmread = counting
    try:
        result = fn()
    finally:
        pydicom.dcmread = original
        fc_module.pydicom.dcmread = original
    return result, counter["count"]


def verify_outputs_match(baseline: dict, cached: dict) -> None:
    assert torch.equal(baseline["view_clips"], cached["view_clips"]), "view clips differ"
    assert torch.equal(baseline["metrics_clips"], cached["metrics_clips"]), "metrics clips differ"
    assert torch.equal(baseline["panecho"], cached["panecho"]), "PanEcho tensors differ"
    assert baseline["motion"] == cached["motion"], "motion frames differ"
    assert baseline["linear"] == cached["linear"], "linear inputs differ"
    assert baseline["doppler"] == cached["doppler"], "doppler inputs differ"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--instances", type=int, default=12)
    parser.add_argument("--frames", type=int, default=60)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="frame_cache_bench_") as root:
        print(f"Synthesizing study: {args.instances} cines x {args.frames} frames (800x600, RLE)")
        study = build_study(root, args.instances, args.frames)
        print(
            f"  PLAX={len(study['plax'])} A4C={len(study['a4c'])} Doppler={len(study['doppler'])}"
        )

        # Warm OS file cache so both runs read from memory equally.
        run_pipeline(study, cache=None)

        baseline, baseline_decodes = count_full_decodes(
            lambda: run_pipeline(study, cache=None)
        )

        cache = StudyFrameCache(study_uid="bench-study")
        cached, cached_decodes = count_full_decodes(
            lambda: run_pipeline(study, cache=cache)
        )
        snapshot = cache.snapshot()

        verify_outputs_match(baseline, cached)

        reduction = 1.0 - (cached["elapsed_s"] / baseline["elapsed_s"])
        print()
        print("=== Decode + preprocessing phase (model inference excluded) ===")
        print(f"  baseline (no cache):   {baseline['elapsed_s']:8.2f} s   full decodes: {baseline_decodes}")
        print(f"  with frame cache:      {cached['elapsed_s']:8.2f} s   full decodes: {cached_decodes}")
        print(f"  runtime reduction:     {reduction * 100:8.1f} %")
        print()
        print("=== Cache metrics ===")
        for key in (
            "decode_hits",
            "decode_misses",
            "decode_hit_rate",
            "derived_hits",
            "derived_misses",
            "derived_hit_rate",
            "redecodes",
            "evictions",
            "bytes_peak",
        ):
            print(f"  {key:18s} {snapshot[key]}")
        print()

        ok = True
        if cached_decodes != args.instances:
            print(f"FAIL: expected exactly {args.instances} decodes, saw {cached_decodes}")
            ok = False
        else:
            print(f"PASS: each cine decoded exactly once ({cached_decodes}/{args.instances})")
        if snapshot["redecodes"] == 0:
            print("PASS: no eviction-forced re-decodes")
        else:
            print(f"WARN: {snapshot['redecodes']} re-decodes (cache budget too small)")
        print("PASS: cached outputs identical to direct-decode outputs")
        if reduction >= 0.40:
            print(f"PASS: >=40% reduction in decode+preprocess runtime ({reduction * 100:.1f}%)")
        else:
            print(f"FAIL: reduction below 40% ({reduction * 100:.1f}%)")
            ok = False
        return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
