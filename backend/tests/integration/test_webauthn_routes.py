from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.authentication import router as authentication_router


def test_webauthn_openapi_exposes_only_start_complete_routes():
    # --- Step 1: Build a minimal app with the authentication router ---
    app = FastAPI()
    app.include_router(authentication_router, prefix="/api")
    client = TestClient(app)

    # --- Step 2: Inspect OpenAPI path map ---
    openapi = client.get("/openapi.json").json()
    paths = set(openapi["paths"].keys())

    # --- Step 3: Assert canonical WebAuthn route contract ---
    assert "/api/webauthn/registration/start" in paths
    assert "/api/webauthn/registration/complete" in paths
    assert "/api/webauthn/authentication/start" in paths
    assert "/api/webauthn/authentication/complete" in paths
    assert "/api/webauthn/status" in paths
    assert "/api/webauthn/credentials/{credential_id}" in paths

    # --- Step 4: Assert legacy alias routes are removed ---
    assert "/api/auth/webauthn/options/register" not in paths
    assert "/api/auth/webauthn/register" not in paths
    assert "/api/auth/webauthn/options/authenticate" not in paths
    assert "/api/auth/webauthn/authenticate" not in paths
    assert "/api/auth/webauthn/registration/start" not in paths
    assert "/api/auth/webauthn/registration/complete" not in paths
    assert "/api/auth/webauthn/authentication/start" not in paths
    assert "/api/auth/webauthn/authentication/complete" not in paths


def test_webauthn_openapi_grouping_uses_dedicated_tag():
    # --- Step 1: Build app and inspect OpenAPI schema ---
    app = FastAPI()
    app.include_router(authentication_router, prefix="/api")
    client = TestClient(app)
    openapi = client.get("/openapi.json").json()

    # --- Step 2: Ensure WebAuthn routes are grouped under WebAuthn ---
    assert openapi["paths"]["/api/webauthn/status"]["get"]["tags"] == ["WebAuthn"]
    assert openapi["paths"]["/api/webauthn/registration/start"]["post"]["tags"] == ["WebAuthn"]
    assert openapi["paths"]["/api/webauthn/registration/complete"]["post"]["tags"] == ["WebAuthn"]
    assert openapi["paths"]["/api/webauthn/authentication/start"]["post"]["tags"] == ["WebAuthn"]
    assert openapi["paths"]["/api/webauthn/authentication/complete"]["post"]["tags"] == ["WebAuthn"]
    assert openapi["paths"]["/api/webauthn/credentials/{credential_id}"]["delete"]["tags"] == ["WebAuthn"]

    # --- Step 3: Ensure core auth routes remain in Authentication group ---
    assert openapi["paths"]["/api/login"]["post"]["tags"] == ["Authentication"]
    assert openapi["paths"]["/api/logout"]["post"]["tags"] == ["Authentication"]
    assert openapi["paths"]["/api/check-auth"]["get"]["tags"] == ["Authentication"]
