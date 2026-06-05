"""Pydantic schemas for API requests and responses."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Common
# ---------------------------------------------------------------------------

class BaseSchema(BaseModel):
    """Base schema with common configuration."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class APIResponse(BaseSchema):
    """Standard API response wrapper."""

    success: bool = True
    message: str | None = None
    data: dict[str, Any] | list[Any] | None = None
    error: dict[str, Any] | str | None = None


class PaginationParams(BaseSchema):
    """Pagination query parameters."""

    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=50, ge=1, le=100)


class PaginatedResponse(BaseSchema):
    """Paginated response wrapper."""

    items: list[dict[str, Any]]
    total: int
    page: int
    per_page: int
    total_pages: int


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class TokenResponse(BaseSchema):
    """JWT token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class UserLogin(BaseSchema):
    """User login request."""

    email: str
    password: str


class UserRegister(BaseSchema):
    """User registration request."""

    email: str
    password: str
    full_name: str | None = None


class UserResponse(BaseSchema):
    """User response."""

    id: UUID
    email: str
    full_name: str | None
    role: str
    is_active: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Mirrors
# ---------------------------------------------------------------------------

class MirrorCreate(BaseSchema):
    """Create mirror request."""

    name: str = Field(..., min_length=1, max_length=255)
    archive_url: str = Field(..., alias="ArchiveURL")
    distribution: str = Field(..., alias="Distribution")
    components: list[str] = Field(default=[], alias="Components")
    architectures: list[str] = Field(default=[], alias="Architectures")
    sources: bool = Field(default=False, alias="Sources")
    filter: str = Field(default="", alias="Filter")
    filter_with_deps: bool = Field(default=False, alias="FilterWithDeps")
    download_uris: bool = Field(default=False, alias="DownloadUris")
    skip_component_check: bool = Field(default=False, alias="SkipComponentCheck")
    keyrings: list[str] | None = Field(default=None, alias="Keyrings")

    model_config = ConfigDict(populate_by_name=True)


class MirrorUpdate(BaseSchema):
    """Update mirror request."""

    archive_url: str | None = Field(default=None, alias="ArchiveURL")
    distribution: str | None = Field(default=None, alias="Distribution")
    components: list[str] | None = Field(default=None, alias="Components")
    architectures: list[str] | None = Field(default=None, alias="Architectures")

    model_config = ConfigDict(populate_by_name=True)


class MirrorResponse(BaseSchema):
    """Mirror response."""

    name: str
    archive_url: str | None
    distribution: str | None
    components: list[str]
    architectures: list[str]
    last_updated: datetime | None
    package_count: int = 0
    download_size: int = 0


class MirrorUpdatePayload(BaseSchema):
    """Mirror update (sync) payload."""

    force: bool = False
    ignore_checksums: bool = False
    ignore_signatures: bool = False


# ---------------------------------------------------------------------------
# Repositories (Local)
# ---------------------------------------------------------------------------

class RepoCreate(BaseSchema):
    """Create local repository request."""

    name: str = Field(..., min_length=1, max_length=255)
    comment: str | None = None
    default_distribution: str | None = None
    default_component: str | None = None


class RepoResponse(BaseSchema):
    """Local repository response."""

    name: str
    comment: str | None
    default_distribution: str | None
    default_component: str | None
    package_count: int = 0


# ---------------------------------------------------------------------------
# Snapshots
# ---------------------------------------------------------------------------

class SnapshotCreate(BaseSchema):
    """Create snapshot request."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    source_snapshots: list[dict[str, Any]] | None = Field(
        default=None, alias="SourceSnapshots"
    )

    model_config = ConfigDict(populate_by_name=True)


class SnapshotCreateFromSource(BaseSchema):
    """Create snapshot from mirror or repo."""

    name: str
    description: str | None = None


class SnapshotResponse(BaseSchema):
    """Snapshot response."""

    name: str
    description: str | None
    created_at: datetime
    package_count: int = 0


class SnapshotDiff(BaseSchema):
    """Snapshot diff response."""

    source: str
    target: str
    added: list[dict[str, Any]]
    removed: list[dict[str, Any]]
    updated: list[dict[str, Any]]
    summary: dict[str, int]


# ---------------------------------------------------------------------------
# Publish
# ---------------------------------------------------------------------------

class PublishCreate(BaseSchema):
    """Publish snapshot request."""

    source_kind: Literal["snapshot", "local"] = Field(..., alias="SourceKind")
    sources: list[dict[str, Any]] = Field(..., alias="Sources")
    distribution: str = Field(..., alias="Distribution")
    label: str | None = Field(default=None, alias="Label")
    origin: str | None = Field(default=None, alias="Origin")
    force_overwrite: bool = Field(default=False, alias="ForceOverwrite")
    # GPG
    gpg_key: str | None = Field(default=None, alias="GpgKey")
    skip_gpg: bool = Field(default=False, alias="Skip")
    batch_gpg: bool = Field(default=True, alias="Batch")
    keyring: str | None = Field(default=None, alias="Keyring")

    model_config = ConfigDict(populate_by_name=True)


class PublishSwitch(BaseSchema):
    """Switch published snapshot request."""

    snapshots: list[dict[str, Any]] = Field(..., alias="Snapshots")
    force_overwrite: bool = Field(default=False, alias="ForceOverwrite")

    model_config = ConfigDict(populate_by_name=True)


class PublishResponse(BaseSchema):
    """Published repository response."""

    prefix: str
    distribution: str
    component: str
    source: str
    snapshot: str | None


class PublishUpdate(BaseSchema):
    """Update published repository."""

    signing: dict[str, Any] | None = None
    force_overwrite: bool = False


# ---------------------------------------------------------------------------
# Packages
# ---------------------------------------------------------------------------

class PackageSearch(BaseSchema):
    """Package search query."""

    q: str | None = None
    name: str | None = None
    version: str | None = None
    architecture: str | None = None


class PackageResponse(BaseSchema):
    """Package response."""

    key: str
    name: str
    version: str
    architecture: str
    source: str | None
    description: str | None
    size: int | None


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

class TaskResponse(BaseSchema):
    """Background task response."""

    id: str
    type: str
    state: str
    running: bool
    progress: int


# ---------------------------------------------------------------------------
# GPG
# ---------------------------------------------------------------------------

class GPGKey(BaseSchema):
    """GPG key response."""

    id: str
    fingerprint: str
    name: str
    display: str


class GPGKeyImport(BaseSchema):
    """GPG key import response."""

    imported: list[str]
    keys: list[GPGKey]


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

class FileUploadResponse(BaseSchema):
    """File upload response."""

    path: str
    size: int


class FileAddToRepo(BaseSchema):
    """Add files to repository."""

    file_refs: list[str] = Field(..., alias="FileRefs")
    force_replace: bool = Field(default=False, alias="ForceReplace")

    model_config = ConfigDict(populate_by_name=True)


# ---------------------------------------------------------------------------
# System
# ---------------------------------------------------------------------------

class HealthResponse(BaseSchema):
    """Health check response."""

    status: str
    version: str
    timestamp: datetime


class SystemConfig(BaseSchema):
    """System configuration response."""

    aptly_api_url: str
    version: str
    features: list[str]
