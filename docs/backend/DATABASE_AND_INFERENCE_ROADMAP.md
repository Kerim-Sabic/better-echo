# Database and Inference Roadmap

## Current state

The clinical hierarchy is `User -> Study -> Series -> Instance`, with `Patient` linked to studies. Derived outputs live in `DerivedResult`; pipeline work is tracked through jobs, stage runs, and draft/active artifact sets.

The current measurement catalog already includes major LV size/function, valve, Doppler, and selected right-heart values. A display field does not mean every study has a validated source measurement for it.

## Implemented database safeguards

- Composite indexes support dashboard, pipeline, artifact, and longitudinal-result reads.
- Existing databases receive required indexes idempotently at startup.
- Dashboard and study-detail reads prefetch required relationships rather than issuing one relationship query per study or series.
- Longitudinal GLS retrieval is restricted to the owning user, preventing cross-user history aggregation when patient identifiers collide.
- Upload rejects a global DICOM Study Instance UID already owned by another user before writing local data or mutating Orthanc.
- The health endpoint verifies database connectivity, so a running API with an unavailable database returns HTTP 503 instead of a false healthy result.
- Completed pipeline stages persist `_pipeline_runtime.duration_ms` in their payload.

## Required database architecture decision

Patient identifiers are globally unique today while study access is user-scoped. Before a production migration, product and compliance owners must choose one model:

1. **Organization-scoped patients**: introduce organization/tenant membership and `(organization_id, patient_id)` uniqueness. Use this when clinicians at one hospital share a patient record.
2. **User-scoped patients**: add `owner_user_id` and `(owner_user_id, patient_id)` uniqueness. Use this only when each account is deliberately isolated.

Do not drop the existing global patient uniqueness constraint without a tested migration that splits historical patient rows safely. Existing data can contain one patient record referenced by studies owned by different users.

## Inference performance measurement contract

Every production performance experiment should capture, per study and eligible instance:

- stage duration; model/version; device; AMP, compile, batch, and temporal-stride settings;
- source and inferred frame counts; temporal self-check result; fallback reason;
- DICOM decode, preprocessing, transfer, GPU forward pass, postprocess, artifact write, and database-commit duration;
- peak GPU/frame-cache memory, OOM retries, and model cold-load duration;
- prediction confidence and model/input provenance sufficient to reproduce a result.

Stage duration is currently persisted. Add component-level timings before accepting further optimization claims.

## High-value inference work

1. Validate `LINEAR_TEMPORAL_STRIDE=2` on a representative clinical dataset against full-frame inference; retain self-checks and record fallbacks.
2. Benchmark batch sizes by GPU-memory class; use the highest stable value rather than a universal number.
3. Warm EchoPrime after hospital login so the first view prefilter avoids model-load and CUDA initialization latency.
4. Audit view routing per instance; reduce routed clips/weights only after validation proves no required measurement is lost.
5. Evaluate a shared multi-head 2D measurement model. It is the largest architectural speed opportunity because independent models repeatedly process the same cine frames. It requires retraining, calibration, and clinical validation.

## Clinical measurement roadmap

### Safe derived values when validated source inputs already exist

- BSA-indexed LV/LA volumes, LV mass index, and stroke-volume index.
- Relative wall thickness and geometry classification from validated linear dimensions.
- Doppler-derived pressure/gradient values only when waveform type, alignment, and units are verified.
- Longitudinal trend metrics with acquisition-quality and model-version guards.

### New acquisition/model work

- LA volume index and LA strain.
- Diastolic inputs: transmitral inflow, tissue Doppler e', E/e', and transparent indeterminate-state handling.
- RV basal/mid/longitudinal dimensions, FAC, S', RV strain, RA volume, and IVC-based RA pressure estimation.
- TR velocity/PASP with explicit signal-quality requirements.
- 3D LV/LA volumes and 3D EF only after a dedicated 3D acquisition and validation path.

None of these should be shown as diagnostic conclusions until acquisition criteria, model performance, limits of use, versioned reference ranges, and clinician review are validated.

## Authoritative clinical references

- [ASE/EACVI cardiac chamber quantification guidance](https://www.asecho.org/guideline/cardiac-chamber-quantification-by-echo-in-adults/)
- [ASE left-ventricular diastolic function guidance](https://www.asecho.org/guideline/left-ventricular-diastolic-function-by-echo/)
- [ASE right-heart and pulmonary-hypertension guidance](https://www.asecho.org/guideline/right-heart-in-adults-pulmonary-hypertension/)
