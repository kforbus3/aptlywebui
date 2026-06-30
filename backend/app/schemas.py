"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


# --- Auth ---
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# --- Users ---
class UserBase(BaseModel):
    username: str
    email: str = ""
    role: str = "viewer"


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool
    created_at: datetime


# --- Audit ---
class AuditEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    timestamp: datetime
    username: str
    action: str
    resource: str
    method: str
    status: str
    detail: str


# --- Schedules ---
class ScheduleBase(BaseModel):
    name: str
    mirror: str
    cron: str
    enabled: bool = True
    publish_prefix: str = ""
    publish_distribution: str = ""


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(BaseModel):
    name: str | None = None
    mirror: str | None = None
    cron: str | None = None
    enabled: bool | None = None
    publish_prefix: str | None = None
    publish_distribution: str | None = None


class ScheduleResponse(ScheduleBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    last_run: datetime | None = None
    last_status: str = ""
    created_at: datetime
