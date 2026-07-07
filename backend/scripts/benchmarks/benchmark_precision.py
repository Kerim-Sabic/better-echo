"""
Precision / throughput benchmark for the Horalix inference lanes.

Measures FP32 vs FP16 (autocast) vs FP16+channels_last for the two CNN
architectures that dominate GPU time, at the exact production input shapes:

  * motion segmentation : deeplabv3_resnet50, 1 output channel, 112x112
  * 2D measurements     : deeplabv3_resnet50, 2 output channels, 480x640

Random weights and random inputs are used (the trained checkpoints are not
shipped with the repo). Runtime, throughput and VRAM ratios are governed by the
architecture + shape + dtype, so they are representative of production; the
*clinical* accuracy of FP16 is measured separately by ``validate_parity.py`` with
the real weights and labelled data.

The benchmark drives the same ``precision`` helpers used in production so the
numbers reflect the shipped code path (autocast context, channels_last layout,
cudnn.benchmark autotuning).

Usage (from backend/):
    python scripts/benchmarks/benchmark_precision.py --lane motion --batch 16 64
    python scripts/benchmarks/benchmark_precision.py --lane measure --batch 8 16 32
    python scripts/benchmarks/benchmark_precision.py --lane both --json out.json
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, asdict
from typing import Callable, List, Optional

# Allow running as `python scripts/benchmarks/benchmark_precision.py` from backend/.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

os.environ.setdefault("CORS_ORIGIN", '["http://localhost:3000"]')
os.environ.setdefault("ORTHANC_URL", "http://localhost:8042")
os.environ.setdefault("ORTHANC_USER", "bench")
os.environ.setdefault("ORTHANC_PASS", "bench")
os.environ.setdefault("SECRET_KEY", "bench")
os.environ.setdefault("TOKEN_EXPIRE_HOURS", "1")

import torch
from torchvision.models.segmentation import deeplabv3_resnet50

from app.helpers.inference_runtime import precision


# ----------------------------- GPU utilisation sampler ----------------------
class GpuSampler:
    """Background nvidia-smi poller; records mean/peak GPU + memory utilisation."""

    def __init__(self, device_index: int, interval_s: float = 0.05) -> None:
        self.device_index = device_index
        self.interval_s = interval_s
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.util_samples: List[float] = []
        self.mem_samples: List[float] = []
        self._available = self._probe()

    def _probe(self) -> bool:
        try:
            subprocess.run(
                ["nvidia-smi", "--version"],
                capture_output=True,
                check=True,
            )
            return True
        except Exception:
            return False

    def _poll(self) -> None:
        while not self._stop.is_set():
            try:
                out = subprocess.run(
                    [
                        "nvidia-smi",
                        f"--id={self.device_index}",
                        "--query-gpu=utilization.gpu,memory.used",
                        "--format=csv,noheader,nounits",
                    ],
                    capture_output=True,
                    text=True,
                    check=True,
                ).stdout.strip()
                util_str, mem_str = out.split(",")
                self.util_samples.append(float(util_str))
                self.mem_samples.append(float(mem_str))
            except Exception:
                pass
            self._stop.wait(self.interval_s)

    def __enter__(self) -> "GpuSampler":
        if self._available:
            self._thread = threading.Thread(target=self._poll, daemon=True)
            self._thread.start()
        return self

    def __exit__(self, *exc) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1.0)

    def summary(self) -> dict:
        if not self.util_samples:
            return {"gpu_util_mean_pct": None, "gpu_util_peak_pct": None, "mem_used_peak_mb": None}
        return {
            "gpu_util_mean_pct": round(statistics.mean(self.util_samples), 1),
            "gpu_util_peak_pct": round(max(self.util_samples), 1),
            "mem_used_peak_mb": round(max(self.mem_samples), 1),
        }


# ----------------------------- benchmark core -------------------------------
@dataclass
class LaneSpec:
    name: str
    num_classes: int
    height: int
    width: int


LANES = {
    "motion": LaneSpec("motion_segmentation", 1, 112, 112),
    "measure": LaneSpec("study_measurements", 2, 480, 640),
}


@dataclass
class RunResult:
    lane: str
    mode: str
    batch: int
    latency_ms_mean: float
    latency_ms_p50: float
    frames_per_s: float
    torch_peak_mb: Optional[float]
    gpu_util_mean_pct: Optional[float]
    gpu_util_peak_pct: Optional[float]


def _build_model(spec: LaneSpec, device: torch.device) -> torch.nn.Module:
    model = deeplabv3_resnet50(num_classes=spec.num_classes)
    model.to(device).eval()
    precision.configure_backends(device)
    return model


def _time_forward(
    model: torch.nn.Module,
    make_batch: Callable[[], torch.Tensor],
    *,
    device: torch.device,
    amp: bool,
    channels_last: bool,
    iters: int,
    warmup: int,
) -> List[float]:
    if channels_last:
        model.to(memory_format=torch.channels_last)
    latencies: List[float] = []
    for i in range(warmup + iters):
        batch = make_batch()
        if channels_last:
            batch = batch.contiguous(memory_format=torch.channels_last)
        if device.type == "cuda":
            torch.cuda.synchronize()
        start = time.perf_counter()
        with torch.no_grad(), precision.autocast(device, enabled=amp and device.type == "cuda"):
            out = model(batch)["out"]
            _ = torch.sigmoid(out.float())
        if device.type == "cuda":
            torch.cuda.synchronize()
        elapsed = (time.perf_counter() - start) * 1000.0
        if i >= warmup:
            latencies.append(elapsed)
    return latencies


def run_config(
    spec: LaneSpec,
    device: torch.device,
    batch: int,
    mode: str,
    *,
    iters: int,
    warmup: int,
) -> RunResult:
    amp = mode != "fp32"
    channels_last = mode == "fp16_channels_last"
    model = _build_model(spec, device)
    if channels_last:
        model = precision.to_channels_last(model, device)

    def make_batch() -> torch.Tensor:
        return torch.randn(batch, 3, spec.height, spec.width, device=device)

    if device.type == "cuda":
        torch.cuda.reset_peak_memory_stats(device)

    dev_index = device.index if device.index is not None else 0
    with GpuSampler(dev_index) as sampler:
        latencies = _time_forward(
            model,
            make_batch,
            device=device,
            amp=amp,
            channels_last=channels_last,
            iters=iters,
            warmup=warmup,
        )
    gpu = sampler.summary()

    torch_peak_mb = None
    if device.type == "cuda":
        torch_peak_mb = round(torch.cuda.max_memory_allocated(device) / (1024 * 1024), 1)

    mean_ms = statistics.mean(latencies)
    p50_ms = statistics.median(latencies)
    fps = (batch * 1000.0) / mean_ms if mean_ms > 0 else 0.0

    del model
    if device.type == "cuda":
        torch.cuda.empty_cache()

    return RunResult(
        lane=spec.name,
        mode=mode,
        batch=batch,
        latency_ms_mean=round(mean_ms, 2),
        latency_ms_p50=round(p50_ms, 2),
        frames_per_s=round(fps, 1),
        torch_peak_mb=torch_peak_mb,
        gpu_util_mean_pct=gpu["gpu_util_mean_pct"],
        gpu_util_peak_pct=gpu["gpu_util_peak_pct"],
    )


def print_table(results: List[RunResult]) -> None:
    header = (
        f"{'lane':<20}{'mode':<20}{'batch':>6}{'lat_ms':>10}"
        f"{'fps':>10}{'peak_mb':>10}{'util%':>8}"
    )
    print(header)
    print("-" * len(header))
    baseline = {}
    for r in results:
        key = (r.lane, r.batch)
        if r.mode == "fp32":
            baseline[key] = r.frames_per_s
        speedup = ""
        base = baseline.get(key)
        if base and r.mode != "fp32" and base > 0:
            speedup = f"  ({r.frames_per_s / base:.2f}x vs fp32)"
        print(
            f"{r.lane:<20}{r.mode:<20}{r.batch:>6}{r.latency_ms_mean:>10}"
            f"{r.frames_per_s:>10}{str(r.torch_peak_mb):>10}"
            f"{str(r.gpu_util_mean_pct):>8}{speedup}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lane", choices=["motion", "measure", "both"], default="both")
    parser.add_argument("--batch", type=int, nargs="+", default=None,
                        help="Batch sizes to sweep (default: motion=16,64 measure=8,16)")
    parser.add_argument("--iters", type=int, default=30)
    parser.add_argument("--warmup", type=int, default=10)
    parser.add_argument("--device", default=None, help="cuda:0 (default) or cpu")
    parser.add_argument("--json", default=None, help="Write raw results to this JSON path")
    args = parser.parse_args()

    if args.device:
        device = torch.device(args.device)
    else:
        device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

    if device.type != "cuda":
        print("WARNING: running on CPU. FP16 autocast is a no-op on CPU, so all "
              "modes will be identical. Use a CUDA device for a real comparison.\n")

    lanes = ["motion", "measure"] if args.lane == "both" else [args.lane]
    modes = ["fp32", "fp16", "fp16_channels_last"]

    results: List[RunResult] = []
    for lane_key in lanes:
        spec = LANES[lane_key]
        default_batches = [16, 64] if lane_key == "motion" else [8, 16]
        batches = args.batch or default_batches
        for batch in batches:
            for mode in modes:
                print(f"Running {spec.name} batch={batch} mode={mode} on {device} ...")
                try:
                    results.append(
                        run_config(spec, device, batch, mode,
                                   iters=args.iters, warmup=args.warmup)
                    )
                except RuntimeError as exc:
                    print(f"  skipped ({exc})")

    print()
    print_table(results)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(
                {"device": str(device), "results": [asdict(r) for r in results]},
                fh,
                indent=2,
            )
        print(f"\nWrote {args.json}")


if __name__ == "__main__":
    main()
