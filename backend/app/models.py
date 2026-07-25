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


class AppSetting(Base):
    """Key/value store for UI-configurable runtime settings (e.g. timezone).

    Kept separate from env-var config (app.config.Settings): these are edited
    from the UI and persist in the database, overriding the env default.
    """

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # Schedule kind: "mirror" (sync one mirror, optionally republish one target) or
    # "publish" (fleet refresh: sync the mirrors behind the target publications,
    # snapshot them dated, and switch each component to its new snapshot).
    kind: Mapped[str] = mapped_column(String(32), default="mirror", server_default="mirror")
    # Resource the "mirror"-kind schedule operates on (a mirror name). Unused for
    # the "publish" kind.
    mirror: Mapped[str] = mapped_column(String(128), default="", server_default="")
    # JSON list of {"prefix","distribution"} publications for the "publish" kind;
    # an empty list means all publications.
    targets: Mapped[str] = mapped_column(Text, default="", server_default="")
    # Snapshots to keep per mirror (newest first); 0 keeps all. Prunes the dated
    # snapshots this schedule creates so nightly runs don't grow without bound.
    retention: Mapped[int] = mapped_column(Integer, default=7, server_default="7")
    # Cron expression (minute hour day month day_of_week).
    cron: Mapped[str] = mapped_column(String(64), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Optional snapshot/publish prefix to refresh after the mirror updates.
    publish_prefix: Mapped[str] = mapped_column(String(128), default="")
    publish_distribution: Mapped[str] = mapped_column(String(128), default="")
    # GPG key (id/fingerprint) to sign re-published distributions with; empty
    # means aptly's default key. Applies when the schedule re-publishes.
    gpg_key: Mapped[str] = mapped_column(String(64), default="", server_default="")
    last_run: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_status: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
