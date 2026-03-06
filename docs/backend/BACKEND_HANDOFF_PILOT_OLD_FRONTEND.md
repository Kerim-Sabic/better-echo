# Backend Handoff: `pilot-old-frontend` Branch Contract

Last Updated: 2026-03-06  
Owner: Backend

## Purpose

This handoff is for sharing backend contract changes from `pilot-old-frontend` without carrying frontend code, so frontend integration can be done cleanly on the refactored frontend branch.

## Recommendation

Yes, this is the correct strategy:

1. Keep backend + docs (and required root runtime scripts) as the source branch contract.
2. Exclude frontend tree from backend integration commits.
3. Give frontend team a contract-first map (endpoints, semantics, and caveats).

## Backend-Only Share Procedure

1. Create a clean backend-share branch from your current branch:

```powershell
git switch pilot-old-frontend
git switch -c share/backend-queue-contract
```

2. Stage backend/docs/scripts only:

```powershell
git add backend docs package.json scripts/dev-lan.bat scripts/dev-lan.ps1 scripts/dev-lan-with-llm.bat scripts/dev-lan-with-llm.ps1
```

3. Ensure no frontend files are staged:

```powershell
git diff --cached --name-only
```

4. If anything under `frontend/` or local DB file was staged, unstage it:

```powershell
git restore --staged frontend
git restore --staged backend/database.db
```

5. Commit and push (teammate rebases/cherry-picks from this branch):

```powershell
git commit -m "Backend queue orchestration + inference routing + LAN dev support (backend-only handoff)"
git push -u origin share/backend-queue-contract
```

## Core Backend Changes to Know

1. Queue orchestration is backend-owned (`start/status/promote/cancel/regenerate-combined`).
2. Draft vs active artifact boundary is enforced; explicit promote semantics implemented.
3. Promote-intent contract is implemented (`200` immediate promote, `202` intent accepted).
4. Legacy orchestration result routes are observer-only (no stage-driving side effects).
5. Queue prefilter includes hard compatibility + confidence gate + Doppler short-circuit routing.
6. WebAuthn moved to canonical service structure and pilot-safe state handling.
7. Services/helpers were reorganized into canonical modules (pipeline/integrations/reporting/auth).
8. LAN development support added:
   1. New LAN startup scripts.
   2. Backend LAN URL hint logs.
   3. Dynamic CORS inclusion of detected local frontend origin.
9. Reliability/stability pass completed:
   1. Study read endpoints are read-only (no write-on-read commit behavior).
   2. Ownership checks were tightened across study/patient/orchestration observer endpoints.
   3. Study delete treats Orthanc `404` as idempotent success.
   4. SQLite runtime now uses timeout + WAL pragmas for better lock resilience.
   5. Dev startup scripts fail fast when `3000`/`8000` are already occupied.

## Teammate Cherry-Pick Advice

If teammate rebases from this branch but wants backend contract only:

1. Keep:
   1. `backend/**`
   2. `docs/**`
   3. `scripts/dev-*.bat`, `scripts/dev-*.ps1`
   4. root `package.json` when script entries changed
2. Drop:
   1. `frontend/**`
   2. local artifacts (`backend/database.db`, uploads/log files)

## Frontend Integration Contract (For Refactored Frontend Branch)

Use these endpoints as control plane:

1. `POST /api/studies/{study_uid}/pipeline/start`
2. `GET /api/studies/{study_uid}/pipeline/status`
3. `POST /api/studies/{study_uid}/pipeline/promote`
4. `POST /api/studies/{study_uid}/pipeline/cancel`
5. `POST /api/studies/{study_uid}/pipeline/regenerate-combined`

Read-model endpoints stay observer-only:

1. PanEcho/EchoPrime combined results.
2. Dynamic/Measurements combined results.
3. LLM report results.

## Design Decisions (Why)

1. Backend-owned orchestration avoids route-dependent progression and tab-focus issues.
2. Draft artifact sets prevent accidental overwrite of active clinician-visible data.
3. Promote-intent (`202`) keeps UI fast while preserving atomic backend promotion behavior.
4. Observer-only result routes reduce hidden side effects and simplify future viewer wiring.
5. Low-VRAM and server modes are controlled by env policies, not frontend behavior.

## Current Limitations (Pilot Reality)

1. Scheduler currently processes jobs serially in one background thread; true multi-job GPU concurrency is a planned follow-up.
2. WebAuthn memory state remains single-process oriented unless migrated to shared state (Redis) for multi-worker deployment.
3. Some security/deprecation hardening items are intentionally parked until after pilot stabilization.

## Full Changed File Lists (From `main`)

Backend file list:

1. [`BACKEND_HANDOFF_CHANGED_FILES_FROM_MAIN.txt`](./BACKEND_HANDOFF_CHANGED_FILES_FROM_MAIN.txt)

Docs file list:

1. [`BACKEND_HANDOFF_CHANGED_DOCS_FROM_MAIN.txt`](./BACKEND_HANDOFF_CHANGED_DOCS_FROM_MAIN.txt)

## Quick Validation Before Opening PR

1. Backend tests:

```powershell
cd backend
python -m pytest -q
```

2. LAN boot smoke:

```powershell
scripts\dev-lan.bat
```

3. Manual queue smoke:
   1. Start -> status polling.
   2. Continue/promote behavior (`200` or `202` paths).
   3. Cancel semantics (new-study vs append).
