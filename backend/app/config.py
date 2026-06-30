"""Application configuration loaded from environment variables."""

from __future__ import annotations

import secrets

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings. All values can be overridden via environment variables."""

    model_config = SettingsConfigDict(env_prefix="", env_file=".env", extra="ignore")

    # --- Core ---
    secret_key: str = secrets.token_urlsafe(48)
    aptly_api_url: str = "http://localhost:8080"
    # Directory for the SQLite database and other UI state.
    data_dir: str = "/data/webui"

    # --- Auth / JWT ---
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    password_min_length: int = 8

    # --- First-run admin seed ---
    admin_username: str = "admin"
    admin_password: str = "admin"
    admin_email: str = "admin@example.com"

    # --- Behaviour ---
    # Comma-separated list of allowed CORS origins; "*" allows all (dev only).
    cors_origins: str = "*"
    # Where aptly stores its data on disk (used by backup/restore).
    aptly_root_dir: str = "/data/aptly"

    @property
    def db_path(self) -> str:
        return f"{self.data_dir.rstrip('/')}/aptly_webui.db"

    @property
    def database_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.db_path}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
