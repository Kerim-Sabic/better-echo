# WebAuthn Pilot Smoke Checklist

Last Updated: 2026-03-02  
Owner: Engineering

## Scope

Pilot-readiness checklist for biometric enroll/login/remove after the WebAuthn route and Swagger grouping changes.

This checklist validates:

1. WebAuthn API contract under `/api/webauthn/*`.
2. End-user biometric flows in UI.
3. Deployment-mode safety for ceremony state (`single process` vs `multi-worker`).

## Required Environment

1. Backend is running and reachable at `http://127.0.0.1:8000`.
2. Frontend/Electron build points to the same backend build.
3. Route client calls use [`AuthenticationApi.js`](../../frontend/src/api/AuthenticationApi.js).
4. WebAuthn routes come from [`router.py`](../../backend/app/api/authentication/webauthn/router.py).
5. WebAuthn state mode envs are set in backend `.env`:
1. `WEBAUTHN_STATE_BACKEND`
2. `WEBAUTHN_REQUIRE_SINGLE_PROCESS`

## Pre-Flight (2 minutes)

1. Confirm backend tests pass:
```powershell
npm run test:backend
```
2. Confirm frontend tests pass:
```powershell
npm run test:frontend
```
3. Open Swagger at `http://127.0.0.1:8000/docs`.

Expected result:

1. No test failures.
2. Swagger loads successfully.

## A. Swagger Route Contract Check

1. In Swagger, confirm a dedicated `WebAuthn` group exists.
2. Confirm these endpoints are listed exactly:
1. `GET /api/webauthn/status`
2. `POST /api/webauthn/registration/start`
3. `POST /api/webauthn/registration/complete`
4. `POST /api/webauthn/authentication/start`
5. `POST /api/webauthn/authentication/complete`
6. `DELETE /api/webauthn/credentials/{credential_id}`
3. Confirm old `/api/auth/webauthn/*` endpoints are absent.

Expected result:

1. Only `/api/webauthn/*` paths appear.
2. No WebAuthn routes appear under the generic Authentication group.

## B. UI Flow: Enroll Biometrics

1. Log in with username/password.
2. Open account menu on dashboard.
3. Click `Enroll biometrics`.
4. Complete biometric prompt on the device.
5. Re-open account menu and inspect biometric state.

Expected result:

1. Enrollment succeeds without UI error.
2. Credential count shows enrolled state.
3. Backend returns success from registration start and complete endpoints.

## C. UI Flow: Biometric Login

1. Log out.
2. On login screen, click `Biometric`.
3. Complete biometric prompt.

Expected result:

1. Login succeeds and navigates to dashboard.
2. Auth cookie is set.
3. No `No pending authentication` error appears in normal flow.

## D. UI Flow: Remove Credential

1. Open account menu on dashboard.
2. Click `Remove biometrics`.
3. Confirm status after removal.
4. Log out and try biometric login again.

Expected result:

1. Remove succeeds.
2. Status is no longer enrolled.
3. Biometric login fails gracefully (expected) until re-enrollment.

## E. Multi-User Safety Check (Pilot Critical)

1. Confirm backend process model for pilot.
2. Confirm `WEBAUTHN_STATE_BACKEND=memory` and `WEBAUTHN_REQUIRE_SINGLE_PROCESS=true` for pilot default.
3. If backend is single process (single worker), current in-memory ceremony state is acceptable for pilot.
4. If backend is multi-worker or multiple backend instances, this is a pilot blocker for reliable biometrics.

Decision rule:

1. `Single process`: proceed.
2. `Multi-worker/replica`: do one before pilot:
1. force single worker for pilot, or
2. move pending ceremony state to shared storage (Redis) before pilot.

## F. Fast Failure Triage

If `Enroll` fails:

1. Verify `POST /api/webauthn/registration/start` returns 200.
2. Verify `POST /api/webauthn/registration/complete` returns 200.
3. Check backend logs for FIDO2 verification errors.

If biometric login fails:

1. Verify `POST /api/webauthn/authentication/start` returns 200.
2. Verify `POST /api/webauthn/authentication/complete` returns 200.
3. If `No pending authentication` appears intermittently, re-check worker model (single-process requirement).

If Swagger grouping is wrong:

1. Confirm route tags in:
1. [`login_api.py`](../../backend/app/api/authentication/login_api.py)
2. [`logout_api.py`](../../backend/app/api/authentication/logout_api.py)
3. [`check_auth_api.py`](../../backend/app/api/authentication/check_auth_api.py)
4. [`router.py`](../../backend/app/api/authentication/webauthn/router.py)
2. Confirm no global auth tag override in [`main.py`](../../backend/app/main.py).

## Pilot Go/No-Go Criteria

Go:

1. Section A passes completely.
2. Sections B/C/D pass on pilot hardware.
3. Section E confirms single-process backend or shared-state implementation.

No-Go:

1. Any WebAuthn endpoint contract mismatch.
2. Any intermittent `pending state` failures under planned deployment mode.
