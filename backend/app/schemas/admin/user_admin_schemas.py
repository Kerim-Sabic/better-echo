from pydantic import BaseModel, Field

from app.schemas.authentication.authentication_schemas import UserInfo


class BootstrapAdminRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)
    full_name: str = Field(min_length=1, max_length=256)


class BootstrapAdminResponse(BaseModel):
    message: str
    user: UserInfo


class ManagedUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)
    full_name: str = Field(min_length=1, max_length=256)
    role: str = Field(min_length=1, max_length=32)


class ManagedUserUpdateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    full_name: str = Field(min_length=1, max_length=256)
    role: str = Field(min_length=1, max_length=32)
    password: str | None = Field(default=None, min_length=1, max_length=256)


class ManagedUsersListResponse(BaseModel):
    users: list[UserInfo]
    total_users: int
    max_users: int


class ManagedUserMutationResponse(BaseModel):
    message: str
    user: UserInfo
    total_users: int
    max_users: int


class ManagedUserDeleteResponse(BaseModel):
    message: str
    total_users: int
    max_users: int


class AdminSetupStatusResponse(BaseModel):
    bootstrap_required: bool
    total_users: int
    admin_count: int
    max_users: int
