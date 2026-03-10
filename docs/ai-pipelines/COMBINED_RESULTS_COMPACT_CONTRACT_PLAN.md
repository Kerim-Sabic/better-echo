# Combined Results Compact Contract Plan

Last Updated: 2026-03-11  
Owner: Backend + Frontend Integration

## Scope

This document captures the follow-up plan for trimming the `PanEcho-EchoPrime-combined-results` contract now that the larger queue/results/frontend refactor is already in place.

In scope:

1. Compact the combined PanEcho+EchoPrime observer payload.
2. Preserve edit/save/reset behavior.
3. Keep the backend as the source of truth for display logic.
4. Remove duplicated response data in a staged way.
5. Record what is already done so this branch can be paused and resumed safely.

Out of scope:

1. Dynamic/Measurements observer payload changes beyond what is already implemented.
2. LLM observer payload changes.
3. Queue execution behavior.
4. DB schema migrations.
5. Audit UI for `edited_by` / `edited_at`.

## Why This Exists

The current combined results response is functional, but it still contains duplication:

1. `display` is the frontend-ready representation.
2. `integrated_tasks` still ships the raw combine payload.
3. `overrides` historically included more metadata than the active frontend needs.

That means the same measurement can effectively appear twice:

1. once in raw form inside `integrated_tasks`
2. once in display-ready form inside `display`

The goal of this plan is to keep only the minimum pieces the frontend actually needs:

1. `display` = what the doctor sees
2. `edit_baselines` = what the AI originally said for editable tasks
3. `overrides` = what the doctor changed
4. `overrides_updated_at` = last mutation timestamp for the override set

## Branch / Baseline Assumption

This plan assumes work resumes on the branch that already contains:

1. the queue/results split
2. backend-owned measurement display logic
3. backend-owned combined measurement display payload
4. normalized dynamic/measurements observer payload
5. frontend cutover to backend-owned measurement display
6. canonical `results` / `pipeline` package naming
7. compact-contract Iteration 1 described below

If this work is resumed elsewhere, that branch must first carry the completed items listed in the next section.

## What Has Already Been Done

### A) Larger Architecture Refactor Already Completed

These larger refactor steps are already implemented on this branch.

#### Iteration 1: API split and Swagger separation

Done:

1. Backend active API structure is now:
   1. `backend/app/api/results/`
   2. `backend/app/api/pipeline/`
2. Swagger groups results and pipeline separately.
3. Legacy `orchestration_apis` active paths were removed later in the cleanup phase.

Why it mattered:

1. Observer result readers are not orchestration triggers.
2. Queue mutations and read-only result endpoints needed clearer separation.

#### Iteration 2: Backend-owned measurement catalog

Done:

1. Backend now owns the measurement display catalog in:
   1. `backend/app/configs/measurement_display_catalog.json`
2. Backend now owns range/color/edit metadata logic in:
   1. `backend/app/helpers/clinical/measurement_display.py`
3. Backend no longer depends on frontend range JSON as its source of truth.

Why it mattered:

1. The backend was previously reading frontend-owned measurement range config.
2. Clinical display meaning needed one canonical source.

#### Iteration 3: Backend-owned combined display payload

Done:

1. `GET /api/studies/{study_uid}/PanEcho-EchoPrime-combined-results` now returns a backend-built `display` payload.
2. `PATCH /api/studies/{study_uid}/PanEcho-EchoPrime-overrides` also returns the recomputed display payload.
3. Derived metrics were moved backend-side:
   1. `relative_wall_thickness`
   2. `max_aortic_gradient`
   3. `cardiac_output`
4. `TRV` is now treated as a derived measurement from `tvpkgrad` / `TRPG`.

Why it mattered:

1. Frontend should not be recomputing clinical display logic.
2. Save/reset behavior should re-render from backend-owned truth.

#### Iteration 4: Dynamic/Measurements observer normalization

Done:

1. Dynamic observer payload is normalized and typed.
2. Backend now owns the `instances/results` response shape instead of passing raw `value_json`.

Why it mattered:

1. The frontend only needed a small, stable subset of fields.
2. Result payloads should be read contracts, not raw stage dumps.

#### Iteration 5: Frontend cutover to backend display

Done:

1. Combined measurement cards now render from backend `display`.
2. The old frontend-only measurement builder was removed from the active path.
3. The only remaining frontend logic in this area is a thin indexed/raw display transform.

Why it mattered:

1. The frontend is now thinner.
2. Clinical meaning and measurement grouping are backend-owned.

#### Iteration 6: Canonicalization cleanup

Done:

1. Active legacy `orchestration_apis` naming was removed from backend/frontend code paths.
2. Canonical active packages are:
   1. `backend/app/api/results`
   2. `backend/app/api/pipeline`
   3. `backend/app/schemas/results`
   4. `backend/app/schemas/pipeline`
   5. `frontend/src/api/results`
   6. `frontend/src/api/pipeline`
3. Docs and tests were updated to match the canonical structure.

Why it mattered:

1. The codebase now reflects the real architecture.
2. Future work should not build on stale naming.

### B) Compact-Contract Iteration 1 Already Completed

This sub-plan already has its first iteration implemented.

Done:

1. Added `edit_baselines` to the combined response.
2. Slimmed public `overrides` down to only:
   1. `{ "value": ... }`
   2. `{ "label": ... }`
3. Kept `integrated_tasks` temporarily for compatibility.
4. Added focused serializer and route contract tests.

Current response shape right now:

```json
{
  "status": "complete",
  "panecho_echoprime_results": {
    "integrated_tasks": { "...": "..." },
    "edit_baselines": { "...": "..." },
    "overrides": { "...": "..." },
    "overrides_updated_at": "...",
    "display": { "...": "..." }
  }
}
```

What this means:

1. `display` is now the active rendering payload.
2. `edit_baselines` is the future-safe minimal source for edit/save/reset behavior.
3. `integrated_tasks` still exists only as a temporary compatibility field.

## Current State (Before Remaining Work)

### Current Combined Contract

The contract currently includes:

1. `integrated_tasks`
2. `edit_baselines`
3. `overrides`
4. `overrides_updated_at`
5. `display`

This is already better than the old contract, but the final duplication is not removed yet because:

1. frontend still reads `integrated_tasks` in the active edit path
2. therefore backend cannot remove `integrated_tasks` safely yet

### Why `edit_baselines` Exists

`edit_baselines` is the minimal original-AI snapshot the frontend needs for edit behavior.

Examples:

1. Numeric task:
   1. `ejection_fraction -> { "rawValue": 58.4 }`
2. Categorical task:
   1. `aortic_stenosis -> { "label": "Mild" }`

This is cleaner than sending the full raw combine payload because edit/save/reset only needs:

1. original raw AI value for numeric tasks
2. original AI label for categorical tasks

It does not need:

1. model-specific probability internals for numeric tasks
2. duplicate display labels
3. duplicate units
4. combine-time source fields already represented in `display`

## Final Target

The final target contract is:

```json
{
  "status": "complete",
  "panecho_echoprime_results": {
    "display": { "...": "..." },
    "edit_baselines": { "...": "..." },
    "overrides": { "...": "..." },
    "overrides_updated_at": "..."
  }
}
```

Important meaning:

1. `display` = what the frontend renders
2. `edit_baselines` = what the AI originally said for editable canonical tasks
3. `overrides` = what the doctor changed
4. `overrides_updated_at` = last override mutation timestamp

What will be gone:

1. `integrated_tasks` from the public response

## Detailed Remaining Plan

## Iteration 2: Frontend Cutover To `edit_baselines`

### Objective

Stop using `integrated_tasks` in the active frontend edit flow.

### Why This Is The Next Step

Backend cannot safely remove `integrated_tasks` until the frontend no longer depends on it.

Right now the frontend still uses `integrated_tasks` as the baseline for:

1. edit start values
2. change detection
3. reset behavior
4. numeric raw/indexed conversion decisions

That responsibility should move to `edit_baselines`.

### Current vs Target

Current frontend behavior:

1. Render from `display`
2. Read edit baselines from `integrated_tasks`
3. Read saved override state from `overrides`

Target frontend behavior:

1. Render from `display`
2. Read edit baselines from `edit_baselines`
3. Read saved override state from `overrides`

### Files To Modify

Primary frontend files:

1. `frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js`
2. `frontend/src/features/StudyResults/hooks/__tests__/useAiMeasurementsViewModel.test.js`
3. `frontend/src/features/StudyResults/hooks/__tests__/useStudyResultsData.test.js`

Potential supporting files:

1. `frontend/src/features/StudyResults/helpers/applyIndexedMeasurementDisplay.js`
   1. only if shape assumptions need small adjustments
2. `frontend/src/features/StudyResults/helpers/printMeasurements.js`
   1. only if any baseline-coupled assumptions remain

### Detailed Change List

#### A) `useAiMeasurementsViewModel.js`

Change:

1. Stop reading edit baseline data from `activeResults.integrated_tasks`.
2. Read edit baseline data from `activeResults.edit_baselines`.

Specific behavior to preserve:

1. Numeric edit start:
   1. use saved override if present
   2. else use `edit_baselines[key].rawValue`
2. Categorical edit start:
   1. use saved override if present
   2. else use `edit_baselines[key].label`
3. Reset:
   1. clear override
   2. refresh
   3. UI falls back to AI baseline from `edit_baselines`
4. Indexed mode:
   1. still uses raw baseline values
   2. still converts display input back to raw before persistence

Remove active dependency on:

1. `integrated_tasks` for baseline resolution

Keep temporarily if needed only for safety during refactor:

1. local fallback branch behind a short-lived compatibility block

Preferred implementation:

1. remove the dependency fully if tests show no breakage

#### B) `useAiMeasurementsViewModel.test.js`

Update fixtures and expectations so tests prove:

1. numeric edits start from `edit_baselines.rawValue`
2. categorical edits start from `edit_baselines.label`
3. reset path still works
4. indexed conversion still uses raw baseline values

#### C) `useStudyResultsData.test.js`

Update any fixtures that still assume only:

1. `integrated_tasks`

to instead include:

1. `display`
2. `edit_baselines`
3. slim `overrides`

### Acceptance Criteria

1. No active frontend edit behavior depends on `integrated_tasks`.
2. Combined results UI still renders correctly.
3. Numeric overrides still save correctly.
4. Categorical overrides still save correctly.
5. Reset still restores AI baseline correctly.
6. Indexed/raw mode still behaves correctly.

### Tests

Run:

1. targeted frontend StudyResults hook tests first
2. full frontend test suite
3. frontend build

### Risks

1. Numeric edit baseline could accidentally use formatted display text instead of raw value.
2. Indexed mode could drift if it stops using raw baselines.
3. Classification tasks could lose correct default label if test fixtures are incomplete.

### Risk Mitigation

1. Keep hook tests focused on baseline resolution.
2. Add one explicit indexed-mode numeric edit test.
3. Add one explicit categorical edit baseline test.

## Iteration 3: Remove `integrated_tasks` From Public Combined Response

### Objective

Remove the last duplicated field from the combined observer response.

### Why This Must Happen After Iteration 2

Before Iteration 2, frontend still needed `integrated_tasks`.
After Iteration 2, it should not.
Only then can the backend remove it cleanly.

### Current vs Target

Current response:

```json
{
  "panecho_echoprime_results": {
    "integrated_tasks": { "...": "..." },
    "edit_baselines": { "...": "..." },
    "overrides": { "...": "..." },
    "overrides_updated_at": "...",
    "display": { "...": "..." }
  }
}
```

Target response:

```json
{
  "panecho_echoprime_results": {
    "edit_baselines": { "...": "..." },
    "overrides": { "...": "..." },
    "overrides_updated_at": "...",
    "display": { "...": "..." }
  }
}
```

### Files To Modify

Backend files:

1. `backend/app/schemas/results/combined_panecho_echoprime_schemas.py`
2. `backend/app/helpers/row_to_dict/combined_results_row_to_dict.py`
3. `backend/app/api/results/combined_panecho_echoprime_api.py`
4. `backend/tests/integration/test_results_contracts.py`
5. `backend/tests/unit/test_combined_results_row_to_dict.py`

Potential docs/tests to update:

1. `docs/API_SCHEMA_NOTES.md`

### Detailed Change List

#### A) Response schema cleanup

Remove `integrated_tasks` from the public `CombinedSections` schema.

Keep:

1. `display`
2. `edit_baselines`
3. `overrides`
4. `overrides_updated_at`

#### B) Serializer cleanup

Update `build_combined_sections_payload(...)` so it no longer returns public `integrated_tasks`.

Important note:

1. raw `value_json` in the database is not changing
2. only the public response is changing

#### C) Route behavior

No route semantics change:

1. `GET` remains observer-only
2. `PATCH` still persists overrides and returns recomputed complete payload

Only response content changes.

#### D) Tests

Update integration assertions:

1. assert `integrated_tasks` is absent
2. assert `edit_baselines` is present
3. assert `overrides` remains slim
4. assert `display` still contains expected rendered content

### Acceptance Criteria

1. `integrated_tasks` is absent from the public response.
2. Frontend still works without change after Iteration 2.
3. Save/reset/edit behavior still works.
4. Combined results contract is materially smaller and cleaner.

### Tests

Run:

1. focused backend contract tests
2. full backend suite
3. frontend tests/build again as a regression check

### Risks

1. Some overlooked frontend test fixture or hidden component may still expect `integrated_tasks`.
2. Print/export or hidden view logic may still access raw data shape.

### Risk Mitigation

1. Use grep before removal:
   1. search frontend for `integrated_tasks`
2. Run full frontend suite after the backend contract cleanup.

## Iteration 4: Final Documentation Sync and Cleanup Sweep

### Objective

Make docs reflect the final compact contract and remove stale references to the temporary compatibility field.

### Files To Modify

1. `docs/API_SCHEMA_NOTES.md`
2. `docs/frontend/ARCHITECTURE.md`
3. `docs/backend/ARCHITECTURE.md`
4. `docs/CURRENT_TASKS.md`
5. this plan file itself

### Detailed Change List

1. Update the canonical contract examples to remove `integrated_tasks`.
2. Document `display`, `edit_baselines`, and slim `overrides` in plain language.
3. Mark this compact-contract sub-plan complete in `CURRENT_TASKS.md`.
4. Update this plan file with final status notes and any implementation deviations.

### Acceptance Criteria

1. Docs match the shipped contract.
2. No stale examples show the old duplicated public shape.

## Exact “Done So Far” File Inventory

These are the most important files already changed before the remaining iterations:

Backend:

1. `backend/app/api/results/combined_panecho_echoprime_api.py`
2. `backend/app/api/results/combined_dynamic_measurements_api.py`
3. `backend/app/api/results/llm_report_get_api.py`
4. `backend/app/api/pipeline/*.py`
5. `backend/app/schemas/results/*.py`
6. `backend/app/schemas/pipeline/*.py`
7. `backend/app/services/results/combined_measurements_presenter.py`
8. `backend/app/services/results/dynamic_measurements_presenter.py`
9. `backend/app/helpers/clinical/measurement_display.py`
10. `backend/app/configs/measurement_display_catalog.json`
11. `backend/app/helpers/row_to_dict/combined_results_row_to_dict.py`
12. `backend/app/helpers/row_to_dict/dynamic_measurements_combined_results_row_to_dict.py`

Frontend:

1. `frontend/src/api/results/*.js`
2. `frontend/src/api/pipeline/PipelineApi.js`
3. `frontend/src/features/StudyResults/hooks/useAiMeasurementsViewModel.js`
4. `frontend/src/features/StudyResults/hooks/useStudyResultsData.js`
5. `frontend/src/features/StudyResults/helpers/applyIndexedMeasurementDisplay.js`
6. `frontend/src/features/StudyResults/helpers/printMeasurements.js`
7. `frontend/src/features/StudyResults/components/AiMeasurements/MeasurementBox.jsx`
8. `frontend/src/features/StudyResults/components/Report/MeasurementsReport.jsx`

Tests:

1. `backend/tests/integration/test_results_contracts.py`
2. `backend/tests/unit/test_combined_measurements_presenter.py`
3. `backend/tests/unit/test_dynamic_measurements_presenter.py`
4. `backend/tests/unit/test_measurement_display.py`
5. `backend/tests/unit/test_combined_results_row_to_dict.py`
6. frontend StudyResults hook/helper tests

Docs:

1. `docs/API_SCHEMA_NOTES.md`
2. `docs/backend/ARCHITECTURE.md`
3. `docs/frontend/ARCHITECTURE.md`
4. `docs/HANDBOOK.md`
5. `docs/ai-pipelines/ORCHESTRATION.md`
6. `docs/CURRENT_TASKS.md`

## Resume Checklist

When resuming this plan after branch switching:

1. Return to the branch that contains:
   1. iterations 1-6 of the larger refactor
   2. compact-contract Iteration 1
2. Re-run:
   1. `python -m pytest -q` in `backend/`
   2. `npm test -- --watchAll=false --runInBand` in `frontend/`
   3. `npm run build` in `frontend/`
3. Start from Iteration 2 in this document.
4. Do not remove `integrated_tasks` until the frontend cutover is verified.

## Final Desired End State

At the end of this sub-plan:

1. Combined results API will expose only the fields the frontend actually needs.
2. Display logic will remain backend-owned.
3. Edit/save/reset will still work cleanly.
4. The payload will be easier to understand, smaller, and less redundant.
5. The frontend/backend boundary will be cleaner for future work and installer/pilot handoff.
