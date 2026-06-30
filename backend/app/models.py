"""Database models: users, audit log, and sync schedules."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Role hierarchy used for RBAC checks (higher number = more privilege).
ROLE_LEVELS = {"viewer": 1, "operator": 2, "admin": 3}


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), default="")
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    # One of: admin, operator, viewer
    role: Mapped[str] = mapped_column(String(16), default="viewer", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)
    username: Mapped[str] = mapped_column(String(64), default="", index=True)
    action: Mapped[str] = mapped_column(String(64), default="")
    resource: Mapped[str] = mapped_column(String(255), default="")
    method: Mapped[str] = mapped_column(String(8), default="")
    status: Mapped[str] = mapped_column(String(16), default="success")
    detail: Mapped[str] = mapped_column(Text, default="")


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # Resource the schedule operates on, e.g. a mirror name.
    mirror: Mapped[str] = mapped_column(String(128), nullable=False)
    # Cron expression (minute hour day month day_of_week).
    cron: Mapped[str] = mapped_column(String(64), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Optional snapshot/publish prefix to refresh after the mirror updates.
    publish_prefix: Mapped[str] = mapped_column(String(128), default="")
    publish_distribution: Mapped[str] = mapped_column(String(128), default="")
    last_run: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_status: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
