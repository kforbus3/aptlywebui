"""UI-configurable application settings (currently the display/scheduler timezone).

Reading is allowed for any authenticated user so the frontend can format dates
in the configured zone; changing settings requires admin.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import audit, scheduler as sched_mod, settings_store
from app.db import get_db
from app.deps import require_admin, require_viewer
from app.models import User

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
async def get_settings(_: User = Depends(require_viewer), db: AsyncSession = Depends(get_db)):
    return {"timezone": await settings_store.get_timezone(db)}


@router.get("/timezones")
async def list_timezones(_: User = Depends(require_viewer)):
    """All IANA timezone names for the settings picker."""
    return {"timezones": settings_store.list_timezones()}


@router.put("")
async def update_settings(
    body: dict = Body(...),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    tz = body.get("timezone")
    if tz is not None:
        if not settings_store.valid_timezone(tz):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown timezone: {tz}")
        await settings_store.set_setting(db, settings_store.KEY_TIMEZONE, tz)
        # Reschedule jobs so cron triggers and dated snapshot names use the new zone.
        await sched_mod.apply_timezone(tz)
        await audit.record(db, username=user.username, action="update_settings",
                           resource="timezone", method="PUT", detail=tz)
    return {"timezone": await settings_store.get_timezone(db)}
