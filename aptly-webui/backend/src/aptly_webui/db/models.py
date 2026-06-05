"""Database models."""

from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

if TYPE_CHECKING:
    pass


class Base(DeclarativeBase):
    """Base model class."""

    pass


class UserRole(str, PyEnum):
    """User roles for RBAC."""

    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"
    SERVICE = "service"


class TaskStatus(str, PyEnum):
    """Background task status."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AptlyInstanceType(str, PyEnum):
    """Aptly instance types."""

    HOST = "host"
    DOCKER = "docker"
    REMOTE = "remote"


class AptlyAuthMethod(str, PyEnum):
    """Aptly authentication methods."""

    NONE = "none"
    BASIC = "basic"
    TOKEN = "token"


class User(Base):
    """User model."""

    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[UserRole] = mapped_column(
        String(50), default=UserRole.VIEWER.value
    )
    auth_provider: Mapped[str] = mapped_column(
        String(50), default="local"
    )  # local, ldap, oidc
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    audit_logs: Mapped[list["AuditLog"]] = relationship(
        "AuditLog", back_populates="user", lazy="dynamic"
    )
    tasks: Mapped[list["SyncTask"]] = relationship(
        "SyncTask", back_populates="started_by_user", lazy="dynamic"
    )


class AptlyInstance(Base):
    """Aptly instance model."""

    __tablename__ = "aptly_instances"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    instance_type: Mapped[AptlyInstanceType] = mapped_column(
        String(50), default=AptlyInstanceType.HOST.value
    )

    # Connection details
    host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    api_path: Mapped[str] = mapped_column(String(255), default="/api")
    use_ssl: Mapped[bool] = mapped_column(Boolean, default=False)
    verify_ssl: Mapped[bool] = mapped_column(Boolean, default=True)

    # Authentication
    auth_method: Mapped[AptlyAuthMethod] = mapped_column(
        String(50), default=AptlyAuthMethod.NONE.value
    )
    auth_config: Mapped[dict | None] = mapped_column(
        JSON, nullable=True
    )  # Encrypted credentials

    # Docker-specific
    docker_host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    docker_container: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # CLI-specific
    cli_path: Mapped[str] = mapped_column(String(255), default="/usr/bin/aptly")
    working_directory: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_reachable: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    mirrors: Mapped[list["MirrorConfig"]] = relationship(
        "MirrorConfig", back_populates="aptly_instance", lazy="dynamic"
    )
    snapshots: Mapped[list["Snapshot"]] = relationship(
        "Snapshot", back_populates="aptly_instance", lazy="dynamic"
    )
    publishes: Mapped[list["Publish"]] = relationship(
        "Publish", back_populates="aptly_instance", lazy="dynamic"
    )


class MirrorConfig(Base):
    """Mirror configuration model."""

    __tablename__ = "mirror_configs"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    aptly_id: Mapped[UUID] = mapped_column(
        ForeignKey("aptly_instances.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    aptly_uuid: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # Reference in Aptly

    # Configuration
    distribution: Mapped[str | None] = mapped_column(String(100), nullable=True)
    components: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    architectures: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), default="standard")
    filter_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # ESM
    esm_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    esm_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sync: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_status: Mapped[str] = mapped_column(String(50), default="pending")
    package_count: Mapped[int] = mapped_column(Integer, default=0)
    download_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    aptly_instance: Mapped[AptlyInstance] = relationship(
        "AptlyInstance", back_populates="mirrors"
    )


class Snapshot(Base):
    """Snapshot model."""

    __tablename__ = "snapshots"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    aptly_id: Mapped[UUID] = mapped_column(
        ForeignKey("aptly_instances.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    aptly_uuid: Mapped[str] = mapped_column(String(255), nullable=False)

    # Source
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # mirror, repo, snapshot
    source_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("mirror_configs.id", ondelete="SET NULL"), nullable=True
    )

    # Metadata
    package_count: Mapped[int] = mapped_column(Integer, default=0)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    aptly_instance: Mapped[AptlyInstance] = relationship(
        "AptlyInstance", back_populates="snapshots"
    )
    publishes: Mapped[list["Publish"]] = relationship(
        "Publish", back_populates="snapshot", lazy="dynamic"
    )

    __table_args__ = (
        # Unique constraint on aptly_id + name
        UniqueConstraint("aptly_id", "name"),
    )


class Publish(Base):
    """Published repository model."""

    __tablename__ = "publishes"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    aptly_id: Mapped[UUID] = mapped_column(
        ForeignKey("aptly_instances.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("snapshots.id", ondelete="SET NULL"), nullable=True
    )

    # Publishing config
    distribution: Mapped[str] = mapped_column(String(100), nullable=False)
    component: Mapped[str] = mapped_column(String(100), nullable=False)
    prefix: Mapped[str] = mapped_column(String(255), default=".")

    # GPG
    gpg_key_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_signed: Mapped[bool] = mapped_column(Boolean, default=True)
    publish_options: Mapped[dict] = mapped_column(JSON, default=dict)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_published: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    aptly_instance: Mapped[AptlyInstance] = relationship(
        "AptlyInstance", back_populates="publishes"
    )
    snapshot: Mapped[Snapshot | None] = relationship("Snapshot", back_populates="publishes")

    __table_args__ = (
        # Unique constraint on aptly_id + distribution + component + prefix
        UniqueConstraint("aptly_id", "distribution", "component", "prefix"),
    )


class SyncTask(Base):
    """Background sync task model."""

    __tablename__ = "sync_tasks"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    aptly_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("aptly_instances.id"), nullable=True
    )

    # Task info
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[TaskStatus] = mapped_column(
        String(50), default=TaskStatus.PENDING.value
    )
    resource_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    resource_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("mirror_configs.id"), nullable=True
    )

    # Progress
    progress_percent: Mapped[int] = mapped_column(Integer, default=0)
    current_operation: Mapped[str | None] = mapped_column(Text, nullable=True)
    logs: Mapped[list] = mapped_column(JSON, default=list)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Results
    result_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Timing
    queued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # User
    started_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )

    # Relationships
    started_by_user: Mapped[User | None] = relationship(
        "User", back_populates="tasks"
    )


class AuditLog(Base):
    """Audit log model."""

    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # User info
    user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Action details
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    resource_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)

    # Context
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    user: Mapped[User | None] = relationship("User", back_populates="audit_logs")


class SearchCache(Base):
    """Search cache model."""

    __tablename__ = "search_cache"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    query_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    query_params: Mapped[dict] = mapped_column(JSON, nullable=False)
    results: Mapped[dict] = mapped_column(JSON, default=dict)
    result_count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Package(Base):
    """Package metadata cache model."""

    __tablename__ = "packages"

    id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid4
    )
    aptly_id: Mapped[UUID] = mapped_column(
        ForeignKey("aptly_instances.id", ondelete="CASCADE"), nullable=False
    )
    aptly_key: Mapped[str] = mapped_column(String(255), nullable=False)

    # Package info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(100), nullable=False)
    architecture: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    section: Mapped[str | None] = mapped_column(String(100), nullable=True)
    priority: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # File info
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    md5: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Dependencies
    depends: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    recommends: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    suggests: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    conflicts: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    provides: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    replaces: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    # Additional metadata
    homepage: Mapped[str | None] = mapped_column(Text, nullable=True)
    maintainer: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        # Unique constraint on aptly_id + aptly_key
        UniqueConstraint("aptly_id", "aptly_key"),
    )
