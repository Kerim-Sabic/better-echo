# EchoPrime Local-File Execution Mode

Last Updated: 2026-07-07
Owner: AI/Backend

## Scope

How EchoPrime secondary-analysis metrics acquire DICOM inputs: local files
first, Orthanc HTTP only as a fallback for instances missing on disk.

## Behavior

Priority path (no HTTP):

```
local file path (Instance.file_path) → decode → inference
```

Fallback path (unchanged legacy behavior):

```
Orthanc listing → download → decode → inference
```

Implemented in
[`secondary_analysis_service.py`](../../backend/app/services/inference/secondary_analysis_service.py)
(`run_secondary_analysis_metrics`):

1. **Explicit instance list** (the pipeline path — `combined` stage passes
   Orthanc IDs from the prefilter payload): each ID is resolved to
   `Instance.file_path` via the DB; files that exist on disk are used
   directly. Only IDs without a local file are downloaded, per chunk, into a
   temp dir (which is no longer created at all when nothing needs
   downloading).
2. **No instance list** (ad-hoc API callers): when every registered instance
   of the study has a file on disk, the DB instance list replaces the Orthanc
   HTTP listing entirely — zero HTTP requests. If the study is only partially
   on disk (or not registered), the legacy Orthanc listing runs exactly as
   before, and local files still substitute for downloads where present.
3. **Execution path is logged and returned** — one of `local`, `mixed`,
   `orthanc`:

   ```
   [SecondaryAnalysis] Execution path selected | study_uid=… path=local local_instances=12/12
   ```

   The label is also included in the service payload / API response
   (`execution_path`, additive optional field on `SecondaryAnalysisResponse`).

Local files feed the per-study frame cache
([FRAME_CACHE.md](FRAME_CACHE.md)) keyed by SOPInstanceUID, so within a
pipeline job the metrics stage typically re-uses the clips already decoded
during prefilter view classification — no decode either.

## Clinical-output parity

The same bytes are decoded either way: an Orthanc download of an instance is
byte-identical to the uploaded local file, and the preprocessing/inference
code after acquisition is untouched. View classification
(`classify_views_for_study`) was already local-only.

## Runtime reduction

Measured with
[`benchmark_local_vs_orthanc.py`](../../backend/benchmark_local_vs_orthanc.py),
which runs the real `download_dicoms_for_instances` against a fake Orthanc
(12 cines × 60 frames @ 800×600 RLE, 352 MB study; acquisition + decode
phase, best of N):

| Scenario | Legacy (download + decode) | Local (decode only) | Reduction | HTTP requests |
| --- | --- | --- | --- | --- |
| Same-host Orthanc (loopback, lower bound) | 15.2 s | 11.0 s | **27.2%** | 12 → 0 |
| 1 Gbps LAN, 5 ms RTT | 17.1 s | 12.7 s | **25.5%** | 12 → 0 |
| 100 Mbps LAN, 5 ms RTT | 41.8 s | 11.7 s | **72.0%** | 12 → 0 |

Loopback is the best case for the legacy path (no real Orthanc storage
lookups, no network); on-prem LAN deployments sit between the last two rows.
On top of this, skipping the Orthanc *listing* for fully-local studies
removes an O(N-instances) request scan per ad-hoc metrics call.

## Verification

[`test_secondary_analysis_local_mode.py`](../../backend/tests/unit/test_secondary_analysis_local_mode.py):

1. fully local study + explicit IDs → any Orthanc HTTP call raises (none happens), `execution_path == "local"`
2. fully local study, no IDs given → Orthanc listing skipped, still zero HTTP
3. one file missing → only that instance is downloaded, `execution_path == "mixed"`
4. partial-local study, no IDs → legacy Orthanc listing preserved
5. nothing on disk → full legacy download path, `execution_path == "orthanc"`
