# Inference Performance Optimization

This document describes the mixed-precision, batching, shared-preprocessing and
temporal-sampling optimizations for the Horalix echocardiography inference
pipeline, how they are made safe, and how to benchmark and clinically validate
them before enabling on a deployment.

> **Scope of what is verified in-repo.** The code changes and their control flow
> (autocast gating, channels_last, cuDNN autotuning, OOM-adaptive batching,
> shared-tensor reuse, temporal interpolation + self-gate) are unit-tested on
> CPU. **Speedups and clinical parity must be measured on the target GPU with
> the real model weights** using the harnesses in
> [`backend/scripts/benchmarks/`](../../backend/scripts/benchmarks/README.md).
> No fabricated benchmark numbers are recorded here.

---

## Design principle: one precision path, safe by construction

All GPU precision decisions route through a single helper,
[`app/helpers/inference_runtime/precision.py`](../../backend/app/helpers/inference_runtime/precision.py),
so behaviour is consistent and centrally toggleable:

| Helper | What it does | CPU / disabled behaviour |
|---|---|---|
| `autocast(device)` | `torch.autocast("cuda", fp16)` context | `nullcontext()` — no-op |
| `configure_backends(device)` | `cudnn.benchmark=True`, TF32 (once/device) | no-op |
| `to_channels_last(model, device)` | channels-last weights | returns model unchanged |
| `as_channels_last(tensor, device)` | channels-last 4-D input | returns tensor unchanged |

Every helper **fails open**: a capability probe that raises is treated as
"unsupported" and the caller silently continues in FP32 / contiguous layout. On
CPU the helpers never even read settings, so the existing CPU fallback path is
bit-for-bit unchanged. This is what makes "automatically fall back to FP32 if
unsupported" true by construction rather than by scattered `if` checks.

FP16 is **not** bit-identical to FP32. Throughout, the reduction/most-sensitive
math (sigmoid, centroid computation, host copies) is forced back to FP32 while
only the convolution stack runs in FP16, so outputs match the FP32 path within a
small, measurable tolerance rather than exactly. "Identical clinical outputs"
therefore means **within the validated tolerances** enforced by
`validate_parity.py`.

---

## Part 1 — Mixed precision (AMP)

**Where:** motion segmentation, 2D measurements, primary analysis (PanEcho);
opt-in for secondary analysis (EchoPrime).

- `torch.autocast(dtype=float16)` wraps every CUDA forward pass.
- `cudnn.benchmark=True` is enabled once per device — safe because inference
  input shapes are fixed (112×112, 480×640, 224×224×16).
- `channels_last` memory format is applied to the DeepLabV3 CNN weights and their
  4-D inputs (the layout FP16 tensor-core conv kernels prefer).
- TF32 is enabled for FP32 matmuls/convs as a free accuracy-preserving speedup on
  Ampere+.

Enabled by `INFERENCE_AMP_ENABLED` (default **on**). The view classifier in
secondary analysis is a *discrete* decision (more precision-sensitive than the
continuous regression/segmentation heads), so its AMP is a separate opt-in flag
`SECONDARY_ANALYSIS_AMP_ENABLED` (default **off**) until locally validated.

**Expected:** 1.7–2× conv-lane speedup and lower VRAM on RTX-class GPUs; confirm
with `benchmark_precision.py` and parity with `validate_parity.py --candidate
fp16`.

## Part 2 — Motion segmentation batching

The model runs at 112×112, which underutilizes large GPUs. Two changes:

1. FP16 + channels_last + cuDNN autotune (Part 1) on the 112×112 conv stack.
2. **OOM-adaptive batching**
   ([`adaptive_batch.py`](../../backend/app/helpers/inference_runtime/adaptive_batch.py)):
   the batch loop halves the batch size and retries the failing slice on a CUDA
   out-of-memory, instead of aborting the study. This makes a large configured
   batch (e.g. 64) **safe** — GPUs with headroom get the throughput, smaller GPUs
   quietly degrade to a batch that fits.

Batch size stays configurable via `MOTION_SEGMENTATION_BATCH`. The shipped
default remains conservative (16) so unknown/small hardware and the CPU fallback
are unaffected; the **recommended RTX deployment value is 64** (see config
below). With the per-study decoded frame cache already in place, at batch 64 the
lane becomes I/O-bound rather than compute-bound, which is the intended regime.

## Part 3 — 2D measurement lane shared preprocessing

Previously each of the ~9 routed 2D weights re-decoded, colour-converted,
resized and **re-built the normalized input tensor** for the same 480×640 cine.

- Decode + resize were already shared once per instance via the study frame
  cache (`linear_inputs` recipe).
- Now the **normalized NCHW float tensor** is built once inside that same cached
  `LinearMeasurementInputs` object (`build_model_input_tensor`) and reused across
  every routed weight — eliminating the per-weight preprocessing entirely.
- FP16 autocast + channels_last + adaptive batching applied to the forward pass.

Result: **one preprocessing pass per cine, one shared tensor across all weights**,
identical outputs. The existing test
`test_load_measurement_inputs_shared_across_eight_weights` already asserts the
"computed once, shared across 8 weights" invariant (1 derived miss + 7 hits); the
shared tensor now lives inside that single cached object. CPU→GPU transfer still
happens per weight/batch (each weight is a distinct model that is
loaded/unloaded under the staged-VRAM policy); the eliminated cost is the
redundant CPU preprocessing, not the unavoidable device copy.

## Part 4 — Temporal sampling (opt-in, default off)

Keypoint trajectories are smooth between adjacent frames, so
[`temporal_sampling.py`](../../backend/app/helpers/inference_runtime/temporal_sampling.py)
can infer every *N*-th frame and linearly interpolate the skipped ones (stride 2
≈ halves keypoint compute). Safeguards:

- The first and last frame are always inferred, so interpolation never
  extrapolates past an anchor.
- **Runtime self-gate:** a few skipped frames are spot-checked with real
  inference; if interpolation error exceeds `LINEAR_TEMPORAL_MAX_POINT_ERROR_PX`,
  the clip transparently falls back to full every-frame inference. A cine whose
  motion is too fast for interpolation therefore silently keeps full fidelity.
- At inferred indices the output is bit-identical to full inference; only skipped
  frames differ.

**Default `LINEAR_TEMPORAL_STRIDE=1` (feature off).** Because it changes the
sampled frame set, it must pass `validate_parity.py --candidate fp16
--temporal-stride 2` (EF, LV dimensions, keypoint trajectories, segmentation) on
a clinical reference set **before** being enabled in production.

---

## Validation

`backend/scripts/benchmarks/validate_parity.py` is the merge gate. It runs each
lane FP32-baseline vs candidate over real cines (no DB/Orthanc) and checks:

| Lane | Metric | Default tolerance |
|---|---|---|
| motion segmentation | worst-frame Dice(FP16, FP32) | ≥ 0.97 |
| 2D measurements | worst length error | ≤ 0.10 cm |
| 2D measurements | worst keypoint trajectory error | ≤ 2.0 px |
| primary analysis | worst PanEcho task delta (EF, LV dims) | ≤ 0.5 |

Exit code is non-zero on `FAIL` so it can gate CI/CD. Record the JSON report with
the deployment.

---

## Recommended RTX deployment configuration

Add to `backend/.env` on an RTX 5080 / 4090 / A100 / L40S / AWS `g6`/`g7` host,
**after** `validate_parity.py --candidate fp16` reports `PASS`:

```dotenv
# Mixed precision (Parts 1–3)
INFERENCE_AMP_ENABLED=true
INFERENCE_AMP_DTYPE=float16
INFERENCE_CHANNELS_LAST=true
INFERENCE_CUDNN_BENCHMARK=true
INFERENCE_ALLOW_TF32=true

# Motion segmentation batch (Part 2) — safe due to OOM-adaptive fallback
MOTION_SEGMENTATION_BATCH=64
STUDY_MEASUREMENTS_BATCH=32
PRIMARY_ANALYSIS_BATCH=16

# Secondary analysis (EchoPrime) AMP — enable only after local view-classifier
# parity check, since view classification is a discrete decision.
SECONDARY_ANALYSIS_AMP_ENABLED=false

# Temporal keypoint sampling (Part 4) — leave OFF until the temporal parity
# report passes on your clinical reference set, then set stride to 2.
LINEAR_TEMPORAL_STRIDE=1
LINEAR_TEMPORAL_INTERPOLATION=true
LINEAR_TEMPORAL_SELF_CHECK=true
LINEAR_TEMPORAL_SELF_CHECK_SAMPLES=3
LINEAR_TEMPORAL_MAX_POINT_ERROR_PX=2.0
```

### Strict-determinism deployments

`cudnn.benchmark` autotuning can pick different convolution algorithms across
runs (results still within FP tolerance). Where bit-reproducible runs are
required, set `INFERENCE_CUDNN_BENCHMARK=false` (and consider
`INFERENCE_AMP_ENABLED=false` for a fully FP32, deterministic path). This trades
throughput for determinism.

---

## Rollback

Every optimization is behind a setting and defaults to safe. To fully revert to
the original behaviour without a code change:

```dotenv
INFERENCE_AMP_ENABLED=false
INFERENCE_CHANNELS_LAST=false
INFERENCE_CUDNN_BENCHMARK=false
MOTION_SEGMENTATION_BATCH=16
LINEAR_TEMPORAL_STRIDE=1
SECONDARY_ANALYSIS_AMP_ENABLED=false
```
