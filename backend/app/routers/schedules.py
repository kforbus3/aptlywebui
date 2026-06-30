"""Scheduled mirror-sync management (operator+ to modify, viewer to list)."""

from __future__ import annotations

from apscheduler.triggers.cron import CronTrigger
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import audit, scheduler as sched_mod
from app.db import get_db
from app.deps import require_operator, require_viewer
from app.models import Schedule, User
from app.schemas import ScheduleCreate, ScheduleResponse, ScheduleUpdate

router = APIRouter(prefix="/schedules", tags=["schedules"])


def _validate_cron(expr: str) -> None:
    try:
        CronTrigger.from_crontab(expr)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid cron expression: {exc}") from exc


@router.get("", response_model=list[ScheduleResponse])
async def list_schedules(_: User = Depends(require_viewer), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Schedule).order_by(Schedule.id))
    return list(result.scalars().all())


@router.post("", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    body: ScheduleCreate, user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)
):
    _validate_cron(body.cron)
    sched = Schedule(**body.model_dump())
    db.add(sched)
    await db.commit()
    await db.refresh(sched)
    sched_mod.add_or_update_job(sched)
    await audit.record(db, username=user.username, action="create_schedule", resource=body.name, method="POST")
    return sched


@router.patch("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: int, body: ScheduleUpdate,
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    sched = await db.get(Schedule, schedule_id)
    if not sched:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    data = body.model_dump(exclude_unset=True)
    if "cron" in data:
        _validate_cron(data["cron"])
    for key, value in data.items():
        setattr(sched, key, value)
    await db.commit()
    await db.refresh(sched)
    sched_mod.add_or_update_job(sched)
    await audit.record(db, username=user.username, action="update_schedule", resource=sched.name, method="PATCH")
    return sched


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: int, user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)
):
    sched = await db.get(Schedule, schedule_id)
    if not sched:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    sched_mod.remove_job(schedule_id)
    name = sched.name
    await db.delete(sched)
    await db.commit()
    await audit.record(db, username=user.username, action="delete_schedule", resource=name, method="DELETE")
    return {"message": "Schedule deleted"}


@router.post("/{schedule_id}/run")
async def run_now(
    schedule_id: int, user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)
):
    sched = await db.get(Schedule, schedule_id)
    if not sched:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Schedule not found")
    await audit.record(db, username=user.username, action="run_schedule", resource=sched.name, method="POST")
    await sched_mod.run_schedule(schedule_id)
    await db.refresh(sched)
    return {"message": "Schedule executed", "last_status": sched.last_status}
