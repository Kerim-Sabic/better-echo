import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.artifacts import AUTH_COOKIE_NAME
from app.core.config import settings
from app.database.db import get_db
from app.database_models import User, WebAuthnCredential
from app.helpers.auth.authentication_functions import (
    create_token,
    get_current_user_id,
    is_desktop_client_request,
)
from app.schemas.authentication.authentication_schemas import AuthResponse
from app.schemas.authentication.webauthn_schemas import (
    AuthCompleteRequest,
    AuthOptionsRequest,
    AuthOptionsResponse,
    RegisterCompleteRequest,
    RegisterCompleteResponse,
    RegisterOptionsResponse,
    RemoveCredentialResponse,
    WebAuthnStatusResponse,
)

from fido2 import cbor
from fido2.webauthn import (
    AuthenticatorAttachment,
    AuthenticatorData,
    PublicKeyCredentialDescriptor,
    PublicKeyCredentialUserEntity,
    UserVerificationRequirement,
)

from app.services.auth.webauthn.credentials import (
    attested_credential_from_record,
    load_credentials,
)
from app.services.auth.webauthn.encoding import b64url, b64url_to_bytes, serialize_options
from app.services.auth.webauthn.fido import server_for_request
from app.services.auth.webauthn.state import pending_auth, pending_register
from app.services.auth.login_activity_service import mark_user_last_login
from app.services.auth.principal_service import (
    USER_PRINCIPAL_TYPE,
    build_user_token_payload,
    serialize_user_auth_principal,
)


router = APIRouter(tags=["WebAuthn"])
logger = logging.getLogger(__name__)


@router.get("/webauthn/status", response_model=WebAuthnStatusResponse)
def get_webauthn_status(
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Return whether the current user has biometrics enrolled.

    Steps:
    1. Query WebAuthnCredential rows for the current user.
    2. Encode credential ids as base64url strings for the frontend.
    3. Return enrollment status + credential ids.
    """
    # --- Step 1: Load stored credentials for this user ---
    records = (
        db.query(WebAuthnCredential)
        .filter(WebAuthnCredential.user_id == current_user_id)
        .all()
    )

    # --- Step 2: Encode credential ids for the UI ---
    credential_ids = [b64url(bytes(rec.credential_id)) for rec in records if rec.credential_id]

    # --- Step 3: Return status payload ---
    return WebAuthnStatusResponse(
        enrolled=bool(credential_ids),
        credential_count=len(credential_ids),
        credential_ids=credential_ids,
    )


@router.post("/webauthn/registration/start", response_model=RegisterOptionsResponse)
def get_register_options(
    request: Request,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Start a WebAuthn registration ceremony for the current (already-authenticated) user.

    Steps:
    1. Load the current user and any existing credential ids.
    2. Ask FIDO2 server for registration options (platform + UV required).
    3. Store the pending state server-side.
    4. Return the publicKey options for `navigator.credentials.create()`.
    """
    # --- Step 1: Validate current user and gather existing credential ids ---
    user = db.query(User).filter(User.id == current_user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")

    server = server_for_request(request)
    existing = [
        PublicKeyCredentialDescriptor(id=rec.credential_id, type="public-key")
        for rec in db.query(WebAuthnCredential).filter(WebAuthnCredential.user_id == current_user_id).all()
        if rec.credential_id
    ]

    # --- Step 2: Create registration options (Windows Hello / platform authenticator) ---
    options, state = server.register_begin(
        PublicKeyCredentialUserEntity(
            id=str(user.id).encode("utf-8"),
            name=user.username,
            display_name=user.full_name or user.username,
        ),
        existing,
        user_verification=UserVerificationRequirement.REQUIRED,
        authenticator_attachment=AuthenticatorAttachment.PLATFORM,
    )

    # --- Step 3: Persist pending registration state (challenge) ---
    pending_register[current_user_id] = state

    # --- Step 4: Return options for the browser ---
    return RegisterOptionsResponse(publicKey=serialize_options(options))


@router.post("/webauthn/registration/complete", response_model=RegisterCompleteResponse)
def complete_register(
    payload: RegisterCompleteRequest,
    request: Request,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Complete a WebAuthn registration ceremony and persist the credential for the user.

    Steps:
    1. Pop pending registration state (challenge) for this user.
    2. Verify the WebAuthn attestation response via FIDO2.
    3. Store the credential id + COSE public key (CBOR bytes) in the DB.
    4. Return the credential id for UI state updates.
    """
    # --- Step 1: Load pending registration state ---
    state = pending_register.pop(current_user_id, None)
    if not state:
        raise HTTPException(status_code=400, detail="No pending registration")

    credential = payload.credential or {}
    server = server_for_request(request)

    # --- Step 2: Verify registration with FIDO2 ---
    try:
        auth_data = server.register_complete(state, credential)
    except Exception as exc:
        logger.warning("WebAuthn registration failed for user_id=%s: %s", current_user_id, exc)
        raise HTTPException(status_code=400, detail=f"Registration failed: {exc}")

    credential_data = getattr(auth_data, "credential_data", None)
    if credential_data is None:
        raise HTTPException(status_code=400, detail="Registration failed: missing credential data")

    # --- Step 3: Persist credential (COSE key stored as CBOR bytes) ---
    try:
        pubkey_bytes = cbor.encode(dict(credential_data.public_key))
    except Exception as exc:
        logger.warning("WebAuthn registration failed to encode public key for user_id=%s: %s", current_user_id, exc)
        raise HTTPException(status_code=400, detail="Registration failed: unable to encode public key")

    aaguid_bytes = bytes(getattr(credential_data, "aaguid", b"") or b"")
    if len(aaguid_bytes) < 16:
        aaguid_bytes = aaguid_bytes.ljust(16, b"\x00")
    elif len(aaguid_bytes) > 16:
        aaguid_bytes = aaguid_bytes[:16]

    sign_count = int(getattr(auth_data, "counter", 0) or 0)

    record = WebAuthnCredential(
        user_id=current_user_id,
        credential_id=credential_data.credential_id,
        public_key=pubkey_bytes,
        sign_count=sign_count,
        aaguid=aaguid_bytes,
    )
    db.add(record)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("WebAuthn registration failed to persist credential for user_id=%s: %s", current_user_id, exc)
        raise HTTPException(status_code=400, detail="Registration failed: unable to save credential")
    logger.info("WebAuthn register complete: stored credential for user_id=%s (pubkey_len=%s)", current_user_id, len(pubkey_bytes))

    # --- Step 4: Return new credential id ---
    return RegisterCompleteResponse(
        message="Biometric credential registered",
        credential_id=b64url(credential_data.credential_id),
    )


@router.post("/webauthn/authentication/start", response_model=AuthOptionsResponse)
def get_auth_options(
    payload: AuthOptionsRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Start a WebAuthn authentication ceremony.

    Notes:
    - Username-less login passes `username=""` and we return allowCredentials across all users.

    Steps:
    1. If a username is provided, validate it and limit allowed credentials to that user.
    2. Load matching stored credentials (attested credential data).
    3. Ask FIDO2 server for authentication options (UV required).
    4. Store pending state server-side and return publicKey options for `navigator.credentials.get()`.
    """
    # --- Step 1: Resolve optional username filter ---
    username = (payload.username or "").strip()
    user = None
    if username:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

    # --- Step 2: Load matching stored credentials ---
    creds = load_credentials(user.id if user else None, db)
    if not creds:
        raise HTTPException(status_code=404, detail="No biometric credential available")

    server = server_for_request(request)

    # --- Step 3: Create authentication options ---
    options, state = server.authenticate_begin(creds, user_verification=UserVerificationRequirement.REQUIRED)

    # --- Step 4: Persist pending auth state and return options ---
    key = username or "*"
    pending_auth[key] = (state, user.id if user else None)
    return AuthOptionsResponse(publicKey=serialize_options(options))


@router.post("/webauthn/authentication/complete", response_model=AuthResponse)
def complete_authenticate(
    payload: AuthCompleteRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Complete a WebAuthn authentication ceremony and issue the normal auth cookie.

    Steps:
    1. Parse the credential id from the WebAuthn response.
    2. Pop pending auth state (challenge) and load the stored credential + user.
    3. Verify the assertion via FIDO2 using the stored public key.
    4. (Best-effort) update the signature counter.
    5. Issue the JWT auth cookie and return the same AuthResponse shape as password login.
    """
    # --- Step 1: Parse credential id ---
    credential = payload.credential or {}
    raw_id_b64 = credential.get("rawId") or credential.get("id")
    if not raw_id_b64:
        raise HTTPException(status_code=400, detail="Missing credential id")
    credential_id = b64url_to_bytes(raw_id_b64)

    # --- Step 2: Load pending auth state + stored credential record ---
    key = (payload.username or "").strip() or "*"
    state_entry = pending_auth.pop(key, None)
    if not state_entry:
        raise HTTPException(status_code=400, detail="No pending authentication")
    state, _user_hint = state_entry

    stored_cred = (
        db.query(WebAuthnCredential)
        .filter(WebAuthnCredential.credential_id == credential_id)
        .first()
    )
    if not stored_cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    user = db.query(User).filter(User.id == stored_cred.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not stored_cred.public_key:
        raise HTTPException(status_code=404, detail="Credential not found")

    # --- Step 3: Verify assertion against stored public key ---
    try:
        creds = [attested_credential_from_record(stored_cred)]
    except Exception as exc:
        logger.warning("WebAuthn auth failed to load stored key for user_id=%s: %s", stored_cred.user_id, exc)
        raise HTTPException(status_code=400, detail="Credential is not usable")

    server = server_for_request(request)
    try:
        server.authenticate_complete(state, creds, credential)
    except Exception as exc:
        logger.warning("WebAuthn authentication failed for user_id=%s: %s", user.id, exc)
        raise HTTPException(status_code=400, detail=f"Authentication failed: {exc}")

    # --- Step 4: Best-effort counter update ---
    try:
        auth_data_b64 = credential.get("response", {}).get("authenticatorData")
        if auth_data_b64:
            counter = AuthenticatorData(b64url_to_bytes(auth_data_b64)).counter
            stored_cred.sign_count = int(counter)
            db.commit()
    except Exception:
        pass

    # --- Step 5: Issue auth cookie and return user info ---
    token_payload = build_user_token_payload(user)
    auth_token_expires = timedelta(hours=settings.TOKEN_EXPIRE_HOURS)
    auth_token = create_token(token_payload, auth_token_expires)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=auth_token,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )
    mark_user_last_login(db, user)

    return {
        "message": "Authentication successful",
        "user": serialize_user_auth_principal(user),
        "auth_token": auth_token if is_desktop_client_request(request) else None,
    }


@router.delete("/webauthn/credentials/{credential_id}", response_model=RemoveCredentialResponse)
def delete_credential(
    credential_id: str,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Remove a stored WebAuthn credential for the current user.

    Steps:
    1. Decode the base64url credential id.
    2. Look up the credential row belonging to the current user.
    3. Delete it and return a confirmation payload.
    """
    # --- Step 1: Decode credential id ---
    try:
        credential_id_bytes = b64url_to_bytes(credential_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid credential id")

    # --- Step 2: Load credential row scoped to current user ---
    record = (
        db.query(WebAuthnCredential)
        .filter(
            WebAuthnCredential.user_id == current_user_id,
            WebAuthnCredential.credential_id == credential_id_bytes,
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Credential not found")

    # --- Step 3: Delete and return confirmation ---
    db.delete(record)
    db.commit()
    logger.info("Removed WebAuthn credential for user_id=%s", current_user_id)
    return RemoveCredentialResponse(message="Credential removed", removed=True)

