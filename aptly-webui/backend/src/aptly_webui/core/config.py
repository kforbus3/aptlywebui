"""Application configuration."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, PostgresDsn, RedisDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = Field(default="Aptly WebUI", description="Application name")
    app_version: str = Field(default="1.0.0", description="Application version")
    debug: bool = Field(default=False, description="Debug mode")
    environment: Literal["development", "staging", "production"] = Field(
        default="development", description="Environment"
    )

    # Server
    host: str = Field(default="0.0.0.0", description="Server host")
    port: int = Field(default=8000, description="Server port")
    reload: bool = Field(default=False, description="Auto-reload on code changes")

    # Database
    database_url: PostgresDsn = Field(
        default="postgresql+asyncpg://user:password@localhost/aptly_webui",
        description="PostgreSQL database URL",
    )
    database_echo: bool = Field(default=False, description="Log SQL queries")
    database_pool_size: int = Field(default=20, description="Connection pool size")
    database_max_overflow: int = Field(default=10, description="Max overflow connections")

    # Redis
    redis_url: RedisDsn = Field(
        default="redis://localhost:6379/0",
        description="Redis URL",
    )
    redis_pool_size: int = Field(default=50, description="Redis connection pool size")

    # Security
    secret_key: str = Field(
        default="change-me-in-production",
        description="Secret key for JWT signing",
        min_length=32,
    )
    encryption_key: str | None = Field(
        default=None,
        description="Key for encrypting sensitive data",
    )
    access_token_expire_minutes: int = Field(
        default=30,
        description="Access token expiration in minutes",
    )
    refresh_token_expire_days: int = Field(
        default=7,
        description="Refresh token expiration in days",
    )
    password_min_length: int = Field(default=8, description="Minimum password length")
    max_login_attempts: int = Field(default=5, description="Max failed login attempts")
    lockout_duration_minutes: int = Field(
        default=30, description="Account lockout duration"
    )

    # CORS
    cors_origins: str = Field(
        default="http://localhost:3000",
        description="Allowed CORS origins (comma-separated)",
    )
    cors_allow_credentials: bool = Field(default=True)
    cors_allow_methods: list[str] = Field(default=["*"])
    cors_allow_headers: list[str] = Field(default=["*"])

    # Aptly Connection
    aptly_api_url: str = Field(
        default="http://localhost:8080",
        description="Default Aptly API URL",
    )
    aptly_api_timeout: int = Field(default=60, description="Aptly API timeout in seconds")
    aptly_cli_path: str = Field(default="/usr/bin/aptly", description="Aptly CLI path")
    aptly_docker_enabled: bool = Field(default=False, description="Enable Docker detection")

    # Cache
    cache_ttl_seconds: int = Field(default=300, description="Cache TTL in seconds")
    enable_auto_sync: bool = Field(default=True, description="Enable automatic cache sync")
    sync_interval_mirrors: int = Field(default=300, description="Mirror sync interval (seconds)")
    sync_interval_snapshots: int = Field(default=60, description="Snapshot sync interval")
    sync_interval_published: int = Field(default=300, description="Published sync interval")

    # Rate Limiting
    rate_limit_requests: int = Field(default=100, description="Requests per window")
    rate_limit_window: int = Field(default=60, description="Rate limit window in seconds")

    # Logging
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO",
        description="Logging level",
    )
    log_format: Literal["json", "text"] = Field(default="text", description="Log format")
    structured_logging: bool = Field(default=False, description="Enable structured logging")

    # Monitoring
    sentry_dsn: str | None = Field(default=None, description="Sentry DSN for error tracking")
    enable_metrics: bool = Field(default=True, description="Enable Prometheus metrics")
    metrics_port: int = Field(default=9090, description="Metrics endpoint port")

    # LDAP (Optional)
    ldap_enabled: bool = Field(default=False, description="Enable LDAP authentication")
    ldap_server: str | None = Field(default=None, description="LDAP server URL")
    ldap_bind_dn: str | None = Field(default=None, description="LDAP bind DN")
    ldap_bind_password: str | None = Field(default=None, description="LDAP bind password")
    ldap_base_dn: str | None = Field(default=None, description="LDAP base DN")
    ldap_user_filter: str = Field(
        default="(uid={username})",
        description="LDAP user filter template",
    )
    ldap_group_filter: str | None = Field(default=None, description="LDAP group filter")

    # OIDC (Optional)
    oidc_enabled: bool = Field(default=False, description="Enable OIDC authentication")
    oidc_issuer_url: str | None = Field(default=None, description="OIDC issuer URL")
    oidc_client_id: str | None = Field(default=None, description="OIDC client ID")
    oidc_client_secret: str | None = Field(default=None, description="OIDC client secret")
    oidc_redirect_uri: str = Field(
        default="http://localhost:8000/auth/callback",
        description="OIDC redirect URI",
    )


    @field_validator("encryption_key")
    @classmethod
    def validate_encryption_key(cls, v: str | None) -> str | None:
        """Validate encryption key length."""
        if v is not None and len(v) < 32:
            raise ValueError("Encryption key must be at least 32 characters")
        return v

    @property
    def database_async_url(self) -> str:
        """Get async database URL."""
        url = str(self.database_url)
        if "postgresql+psycopg" in url:
            return url.replace("postgresql+psycopg", "postgresql+asyncpg")
        if "postgresql://" in url and "postgresql+asyncpg" not in url:
            return url.replace("postgresql://", "postgresql+asyncpg://")
        return url

    @property
    def database_sync_url(self) -> str:
        """Get sync database URL."""
        url = str(self.database_url)
        if "postgresql+asyncpg" in url:
            return url.replace("postgresql+asyncpg", "postgresql+psycopg2")
        return url


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance
settings = get_settings()
