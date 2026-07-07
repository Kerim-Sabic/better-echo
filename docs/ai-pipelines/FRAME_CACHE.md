# Per-Study Decoded Frame Cache

Last Updated: 2026-07-07
Owner: AI/Backend

## Scope

How the analysis pipeline shares one DICOM decode (and one preprocessing pass
per recipe) across PanEcho, EchoPrime, view classification, motion
segmentation, and the measurement pipelines.

## Problem

Before the cache, one analysis job decoded the same cine up to ~8 times:

| Consumer | Entry point | Decodes per cine per job |
| --- | --- | --- |
| View classifier (prefilter) | `EchoPrime.process_dicom_file` | 1 |
| EchoPrime metrics (combined) | `EchoPrime.process_dicom_file` (on a fresh Orthanc download) | 1 |
| PanEcho (combined) | `pick_frames_from_local_dicom` | 1 |
| Motion segmentation (dynamic) | `read_dicom_frames` | 1 (A4C) |
| Linear measurements (dynamic) | `load_measurement_inputs` | up to 8 (once per 2D weight) |
| Spectral measurements (dynamic) | `load_doppler_inputs` | up to 5 (once per Doppler weight, full-cine frame-selection prepass each time) |

## Architecture

Core module: [`frame_cache.py`](../../backend/app/helpers/media/frame_cache.py).

```
                 pipeline runner (_process_job_skeleton)
                 opens study_frame_cache_scope(study_uid)
                 ── lifespan == one analysis job ──
                                │
        ┌───────────────────────┴───────────────────────┐
        │                StudyFrameCache                │
        │                                               │
        │  Decoded layer (key: SOPInstanceUID | path)   │
        │    raw pixel_array (read-only) + header ds    │
        │    → each cine decoded exactly once           │
        │                                               │
        │  Derived layer (key: instance × recipe)       │
        │    echoprime_clip        (classify + metrics) │
        │    panecho_tensor:16     (PanEcho)            │
        │    reader_frames:…       (motion seg)         │
        │    linear_inputs         (shared by 8 weights)│
        │    doppler_inputs:…      (shared by 5 weights)│
        │    → no duplicate preprocessing               │
        └───────────────────────────────────────────────┘
              ▲            ▲            ▲          ▲
         view classify  EchoPrime    PanEcho   motion seg /
         (prefilter)    metrics     (combined) measurements
                        (combined)             (dynamic)
```

Design points:

1. **Keying** — `key_for_path` reads the header (`stop_before_pixels`) and
   keys by `SOPInstanceUID`, falling back to the normalized absolute path.
   This unifies path aliases: the Orthanc re-download used by EchoPrime
   metrics resolves to the same entry as the local upload classified during
   prefilter. (`run_secondary_analysis_metrics` now also prefers the local
   file and only downloads instances that are missing on disk.)
2. **Lifespan** — the pipeline runner wraps the stage loop in
   `study_frame_cache_scope(study_uid)`; the registry is refcounted per
   study, so the cache exists exactly for the analysis job and is freed (with
   a metrics log line) when the job finishes, fails, or is cancelled.
3. **Multiple consumers / thread safety** — every entry is single-flight: a
   per-cell `threading.Event` means concurrent consumers requesting the same
   decode or recipe block on one computation and share the result. Registry
   and cache structures are lock-guarded.
4. **GPU safety** — the cache stores CPU objects only. Torch tensors are
   `detach()`-ed and copied off CUDA before storing; consumers copy to their
   own device (`.to(device)` / `torch.stack` / `torch.cat` all copy). Raw
   pixel arrays are marked read-only so no consumer can mutate a shared
   decode (the Doppler ECG-mask step, which previously wrote through
   `ds.pixel_array` in place, now copies first).
5. **Memory budget** — LRU eviction against `FRAME_CACHE_MAX_MB`
   (default 4096). Evictions and forced re-decodes are counted in metrics
   rather than hidden; with the default budget a typical study fits fully.
6. **Fallback** — every consumer keeps its direct-decode path. Callers
   outside a pipeline job (ad-hoc API inference) get `None` from
   `get_study_frame_cache` and behave exactly as before. Setting
   `FRAME_CACHE_ENABLED=false` disables the cache globally.
7. **Output parity** — recipes reuse the production preprocessing functions
   on the identical raw `pixel_array`, so cached and direct outputs are
   byte-identical (covered by equivalence tests). EchoPrime's stricter
   parsing (no `force=True`) is preserved via the `required_force` flag on
   the decoded entry.

## Metrics

`StudyFrameCache.snapshot()` exposes per-job counters (decode/derived
hits + misses + hit rates, single-flight waits, evictions, re-decodes,
bytes current/peak, decode/preprocess seconds). The runner logs a
`[FRAME_CACHE] Closed study frame cache | …` line per job, and
`global_frame_cache_metrics()` aggregates across open and closed caches for
health/observability endpoints.

## Configuration

| Setting | Default | Meaning |
| --- | --- | --- |
| `FRAME_CACHE_ENABLED` | `true` | Master switch; `false` restores direct decoding |
| `FRAME_CACHE_MAX_MB` | `4096` | Byte budget for decoded + derived entries (LRU beyond it) |

## Verification

1. Unit tests: [`test_frame_cache.py`](../../backend/tests/unit/test_frame_cache.py)
   (cache semantics, concurrency, eviction, GPU safety, lifecycle) and
   [`test_frame_cache_consumers.py`](../../backend/tests/unit/test_frame_cache_consumers.py)
   (per-consumer output equivalence and dedup accounting).
2. Benchmark: [`benchmark_frame_cache.py`](../../backend/benchmark_frame_cache.py)
   replays the pipeline's decode/preprocess sequence over a synthetic
   RLE-compressed study. Reference run (12 cines × 60 frames @ 800×600):
   92 → 12 full decodes, 122.6 s → 39.6 s (**67.7% reduction** in the
   decode + preprocessing phase), outputs byte-identical.
