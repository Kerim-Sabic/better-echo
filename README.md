# Horalix Echocardiography AI App

Local-first echocardiography AI desktop application for importing DICOM studies,
running local inference, reviewing AI overlays and measurements, and generating
clinician-reviewed reports.

The app is built as a desktop workflow around:

- Electron desktop shell.
- FastAPI backend.
- React frontend.
- OHIF-based echo viewer extension.
- Orthanc DICOM server for local study storage.
- Local AI inference pipelines for view classification, measurements,
  segmentation, secondary analysis, and report generation.

## Current Update: Inference Optimization

This update improves inference throughput while keeping clinical safety gates
explicit and reversible.

| Area | What changed | Main files |
|---|---|---|
| Mixed precision | Central AMP, TF32, cuDNN autotune, and channels-last helpers for CUDA inference. CPU stays FP32. | `backend/app/helpers/inference_runtime/precision.py` |
| Adaptive batching | GPU batch loops can retry with smaller batches after CUDA OOM instead of failing the study. | `backend/app/helpers/inference_runtime/adaptive_batch.py` |
| Motion segmentation | Uses AMP/channels-last and adaptive batches for the 112x112 LV segmentation lane. | `backend/app/services/inference/motion_segmentation/inference.py` |
| 2D measurements | Reuses one normalized 640x480 tensor per cine across routed measurement weights, with AMP and adaptive batches. | `backend/app/services/inference/linear_measurements/inference.py` |
| Temporal sampling | Optional stride-based keypoint inference with interpolation and a runtime self-check fallback. Off by default. | `backend/app/helpers/inference_runtime/temporal_sampling.py` |
| Primary analysis | PanEcho batch inference now runs through the shared AMP path on CUDA. | `backend/app/services/inference/primary_analysis_service.py` |
| Secondary analysis | EchoPrime AMP support is present but separately gated because view classification is precision-sensitive. | `backend/app/services/inference/secondary_analysis_service.py` |
| Validation | Benchmark and clinical parity harnesses were added for GPU speed and output-equivalence checks. | `backend/scripts/benchmarks/` |

The detailed engineering note is here:

- `docs/ai-pipelines/INFERENCE_OPTIMIZATION.md`

### Safety Defaults

| Setting | Default | Meaning |
|---|---:|---|
| `INFERENCE_AMP_ENABLED` | `true` | Enables CUDA autocast where supported. No-op on CPU or unsupported devices. |
| `INFERENCE_AMP_DTYPE` | `float16` | AMP dtype for CUDA inference. |
| `INFERENCE_CHANNELS_LAST` | `true` | Uses channels-last memory format for compatible CNN weights and 4-D inputs. |
| `INFERENCE_CUDNN_BENCHMARK` | `true` | Lets cuDNN tune fixed inference shapes for speed. Disable for strict determinism. |
| `INFERENCE_ALLOW_TF32` | `true` | Allows TF32 matmul/convolution on compatible NVIDIA GPUs. |
| `SECONDARY_ANALYSIS_AMP_ENABLED` | `false` | Keeps EchoPrime/view-classification AMP off until locally validated. |
| `MOTION_SEGMENTATION_BATCH` | `16` | Conservative default; RTX deployments can test `64`. |
| `STUDY_MEASUREMENTS_BATCH` | `16` | Conservative default; RTX deployments can test `32`. |
| `LINEAR_TEMPORAL_STRIDE` | `1` | Temporal sampling disabled. Set `2` only after parity validation. |

Every optimization can be disabled through `backend/.env` without a code change.

### Required Validation Before Production

Run from `backend/` on the target GPU with the real model assets installed:

```powershell
python scripts/benchmarks/benchmark_precision.py --lane both --json precision.json
python scripts/benchmarks/validate_parity.py --data <reference-dicom-folder> --candidate fp16 --json parity_fp16.json
```

Only enable temporal sampling after the temporal parity run passes:

```powershell
python scripts/benchmarks/validate_parity.py --data <reference-dicom-folder> --candidate fp16 --temporal-stride 2 --json parity_fp16_temporal.json
```

Keep the JSON reports with the deployment configuration. Speedups should be
reported from these harnesses on the actual deployment GPU, not estimated from a
CPU-only machine.

## Repository Map

| Path | Purpose |
|---|---|
| `backend/` | FastAPI API, database models, inference services, pipeline orchestration, tests. |
| `frontend/` | React application shell, study results UI, API clients, report/PDF view models. |
| `horalix_viewer/` | OHIF viewer customization and AI panel extension. |
| `electron/` | Electron desktop runtime and packaging integration. |
| `scripts/` | Windows-first developer start scripts. |
| `docs/` | Architecture, runbooks, AI pipeline notes, and operations documentation. |
| `backend/scripts/benchmarks/` | GPU benchmark and clinical parity harnesses for inference changes. |

## Quick Start

### Prerequisites

Install:

- Node.js 20+ and npm.
- Python 3.11+.
- Git.
- Docker Desktop, used for Orthanc.

Verify:

```powershell
node -v
npm -v
python --version
docker --version
```

### Install Dependencies

From the repository root:

```powershell
npm install
```

The root `postinstall` installs frontend dependencies as well.

Set up the backend Python environment:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-dev.txt
cd ..
```

### Configure Environment Files

Copy and edit as needed:

- `backend/.env.example` to `backend/.env`
- `frontend/.env.example` to `frontend/.env`

Default local development endpoints:

- Backend API: `http://127.0.0.1:8000`
- Frontend: `http://localhost:3000`
- Orthanc: `http://localhost:8042`

### Start the Full App

No LLM:

```powershell
scripts\dev-start.bat
```

With LLM:

```powershell
scripts\dev-start-with-llm.bat
```

PowerShell equivalents:

```powershell
.\scripts\dev-start.ps1
.\scripts\dev-start-with-llm.ps1
```

LAN testing mode:

```powershell
scripts\dev-lan.bat
scripts\dev-lan-with-llm.bat
```

The start scripts bring up Orthanc when Docker is available, then start the
backend, frontend, and Electron shell.

### Manual Fallback

```powershell
npm run build:electron
npm run dev
```

With LLM enabled:

```powershell
npm run build:electron
npm run dev:llm
```

## Common Commands

```powershell
npm run dev              # full stack, LLM disabled
npm run dev:llm          # full stack, LLM enabled
npm run dev:lan          # full stack, backend bound to 0.0.0.0 for LAN
npm run dev:lan:llm      # full stack LAN + LLM
npm run build            # Electron + frontend build
npm run build:backend    # PyInstaller backend build
npm run dist:win         # Windows installer
npm run test:backend     # backend pytest suite
npm run test:frontend    # frontend Jest suite
npm run test:all         # backend + frontend tests
```

Backend-only validation for this update:

```powershell
cd backend
pytest tests/unit/test_precision_helpers.py tests/unit/test_adaptive_batch.py tests/unit/test_temporal_sampling.py
python scripts/benchmarks/benchmark_precision.py --lane both
```

The benchmark command is meaningful only on a GPU host. On CPU-only machines,
AMP is a no-op and the benchmark cannot represent deployment throughput.

## Developer Notes For Inference Work

- Keep precision behavior routed through `precision.py`; do not add scattered
  `torch.autocast` checks in individual services.
- Keep batch loops OOM-safe when increasing configured batch sizes.
- Treat `LINEAR_TEMPORAL_STRIDE > 1` as a clinical behavior change. It must pass
  `validate_parity.py` before deployment.
- Keep secondary-analysis AMP separate from the primary AMP switch until the
  view-classifier parity has been validated locally.
- Record benchmark and parity JSON files with the deployment config whenever
  changing GPU precision, batch size, or temporal sampling settings.

## Troubleshooting

Docker or Orthanc did not start:

- Start Docker Desktop and rerun the dev script.
- The dev scripts continue when Docker is unavailable, but DICOM import and
  Orthanc-backed workflows need Orthanc running.

Database schema mismatch after backend model changes:

```powershell
cd backend
python -m app.database.setup_db
```

This resets the local development database.

Disable the inference optimizations without changing code:

```dotenv
INFERENCE_AMP_ENABLED=false
INFERENCE_CHANNELS_LAST=false
INFERENCE_CUDNN_BENCHMARK=false
SECONDARY_ANALYSIS_AMP_ENABLED=false
MOTION_SEGMENTATION_BATCH=16
STUDY_MEASUREMENTS_BATCH=16
LINEAR_TEMPORAL_STRIDE=1
```

LLM process issues:

```powershell
.\scripts\stop_llm.ps1
.\scripts\dev-start-with-llm.ps1
```

## More Documentation

- `docs/HANDBOOK.md` - system overview and architecture map.
- `docs/README.md` - documentation index.
- `docs/RUNBOOK.md` - operations runbook.
- `docs/ops/SETUP_FIRST_RUN.md` - first-run setup notes.
- `docs/ai-pipelines/INFERENCE_OPTIMIZATION.md` - detailed note for this update.
- `docs/ai-pipelines/FRAME_CACHE.md` - decoded-frame cache design.
- `docs/ai-pipelines/ECHOPRIME_LOCAL_MODE.md` - EchoPrime local-file execution mode.
