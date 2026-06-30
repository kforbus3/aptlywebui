"""Audit-log viewing (admin only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import require_admin
from app.models import AuditLog, User
from app.schemas import AuditEntry

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditEntry])
async def list_audit(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    username: str | None = None,
    action: str | None = None,
):
    stmt = select(AuditLog).order_by(AuditLog.id.desc())
    if username:
        stmt = stmt.where(AuditLog.username == username)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars().all())
