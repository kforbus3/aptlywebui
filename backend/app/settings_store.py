"""Database-backed, UI-editable runtime settings.

These override the env-var defaults in app.config for values a user may want to
change without redeploying — currently just the display/scheduler timezone.
Reads are cached in-process; writes update the cache and the DB together.
"""

from __future__ import annotations

from zoneinfo import ZoneInfo, available_timezones

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as env_settings
from app.models import AppSetting

KEY_TIMEZONE = "timezone"

# In-process cache so hot paths (date formatting, scheduler stamps) don't hit
# the DB on every call. Populated lazily; refreshed on every set_setting.
_cache: dict[str, str] = {}


def valid_timezone(name: str) -> bool:
    try:
        ZoneInfo(name)
        return True
    except Exception:  # noqa: BLE001 — ZoneInfoNotFoundError and friends
        return False


def list_timezones() -> list[str]:
    """All IANA timezone names, sorted, for the settings dropdown."""
    return sorted(available_timezones())


async def get_setting(db: AsyncSession, key: str, default: str = "") -> str:
    if key in _cache:
        return _cache[key]
    row = await db.get(AppSetting, key)
    value = row.value if row else default
    _cache[key] = value
    return value


async def set_setting(db: AsyncSession, key: str, value: str) -> None:
    row = await db.get(AppSetting, key)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    await db.commit()
    _cache[key] = value


async def get_timezone(db: AsyncSession) -> str:
    """Configured timezone name, falling back to the env default then UTC.
    Always returns a name that resolves to a real zone."""
    tz = await get_setting(db, KEY_TIMEZONE, env_settings.app_timezone)
    return tz if valid_timezone(tz) else "UTC"
