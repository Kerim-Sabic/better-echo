# Inference optimization benchmarks & validation

Two harnesses support the mixed-precision / batching / temporal optimizations.
Both must be run **on the target GPU with the real model assets installed** — they
cannot be meaningfully run on a CPU-only host (FP16 autocast is a no-op on CPU).

Run everything from the `backend/` directory.

---

## 1. `benchmark_precision.py` — speed / throughput / VRAM

Measures FP32 vs FP16 vs FP16+channels_last for the two DeepLabV3 CNN lanes at
production input shapes (motion 112×112, measurements 480×640), driving the same
`precision` helpers the app uses. Uses random weights + inputs, so it reports the
**performance** ratio (which depends only on architecture/shape/dtype), not
clinical accuracy.

```bash
# Full sweep, write raw numbers to JSON
python scripts/benchmarks/benchmark_precision.py --lane both --json precision.json

# Motion segmentation, compare batch 16 vs 64 (Part 2)
python scripts/benchmarks/benchmark_precision.py --lane motion --batch 16 64

# 2D measurement lane
python scripts/benchmarks/benchmark_precision.py --lane measure --batch 8 16 32
```

Reports per (lane, batch, mode): mean latency, frames/s, Torch peak MB, and — if
`nvidia-smi` is on `PATH` — mean/peak GPU utilization, plus the FP16 speedup vs
FP32.

## 2. `validate_parity.py` — clinical output parity (the merge gate)

Runs each optimized lane against its **FP32 / every-frame baseline** over a folder
of real DICOM cines and checks that clinical outputs stay within tolerance. No
Postgres/Orthanc needed — it reads DICOMs from disk and calls the real lane code,
toggling `settings` between baseline and candidate.

```bash
# FP16 parity across motion / measurement / primary lanes
python scripts/benchmarks/validate_parity.py --data /data/echo_reference \
    --candidate fp16 --json parity_fp16.json

# FP16 + temporal stride-2 keypoints (Part 4)
python scripts/benchmarks/validate_parity.py --data /data/echo_reference \
    --candidate fp16 --temporal-stride 2 --json parity_fp16_temporal.json
```

Default tolerances (override with flags):

| Metric | Flag | Default | Meaning |
|---|---|---|---|
| min Dice (motion) | `--min-dice` | 0.97 | worst-frame mask agreement FP16 vs FP32 |
| max length error | `--max-length-err-cm` | 0.10 cm | worst 2D measurement delta |
| max keypoint error | `--max-point-err-px` | 2.0 px | worst keypoint trajectory delta (source space) |
| max primary delta | `--max-primary-delta` | 0.5 | worst absolute PanEcho task delta (EF, LV dims, …) |

Exit code is non-zero on `FAIL`, so it can gate CI/CD. `SKIPPED` lanes (missing
weights) do not fail the run; `NO_DATA` (nothing measurable) exits 0 with a clear
banner.

> EF / LV-dimension parity is covered by the `primary` lane (PanEcho task
> outputs). If your EF pipeline is EchoPrime-based, add `--include-secondary` and
> enable `SECONDARY_ANALYSIS_AMP_ENABLED` for the candidate.

---

## Recommended workflow before enabling an optimization

1. `benchmark_precision.py` on the target GPU → confirm the expected speedup and
   that batch 64 fits VRAM for motion segmentation.
2. `validate_parity.py --candidate fp16` over a representative reference set →
   must report `PASS`.
3. Only if temporal sampling is desired: `validate_parity.py --candidate fp16
   --temporal-stride 2` → must `PASS` with your clinical tolerances before setting
   `LINEAR_TEMPORAL_STRIDE=2` in production.
4. Record the JSON reports alongside the deployment config.
