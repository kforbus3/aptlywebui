"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os
import secrets

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings. All values can be overridden via environment variables."""

    model_config = SettingsConfigDict(env_prefix="", env_file=".env", extra="ignore")

    # --- Core ---
    # If SECRET_KEY isn't provided, a stable key is loaded/created under
    # data_dir (see _resolve_secret_key) so tokens survive restarts and are
    # shared across worker processes.
    secret_key: str = ""
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

    @model_validator(mode="after")
    def _resolve_secret_key(self) -> "Settings":
        # An explicit (non-empty) SECRET_KEY always wins. Otherwise persist a
        # generated key so every process/restart signs JWTs with the same key;
        # falling back to a per-process random key logs users out at random.
        if self.secret_key:
            return self
        key_path = f"{self.data_dir.rstrip('/')}/secret_key"
        try:
            os.makedirs(self.data_dir, exist_ok=True)
            if os.path.exists(key_path):
                with open(key_path) as f:
                    self.secret_key = f.read().strip()
            if not self.secret_key:
                self.secret_key = secrets.token_urlsafe(48)
                with open(key_path, "w") as f:
                    f.write(self.secret_key)
                os.chmod(key_path, 0o600)
        except OSError:
            # Data dir not writable (e.g. tests): fall back to an ephemeral key.
            self.secret_key = self.secret_key or secrets.token_urlsafe(48)
        return self


settings = Settings()
