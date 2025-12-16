from typing import Any, Dict, List

from pydantic import BaseModel


class WebAuthnStatusResponse(BaseModel):
    enrolled: bool
    credential_count: int
    credential_ids: List[str]


class RegisterOptionsResponse(BaseModel):
    publicKey: Dict[str, Any]


class RegisterCompleteRequest(BaseModel):
    credential: Dict[str, Any]


class RegisterCompleteResponse(BaseModel):
    message: str
    credential_id: str


class AuthOptionsRequest(BaseModel):
    username: str


class AuthOptionsResponse(BaseModel):
    publicKey: Dict[str, Any]


class AuthCompleteRequest(BaseModel):
    username: str
    credential: Dict[str, Any]


class RemoveCredentialResponse(BaseModel):
    message: str
    removed: bool
