"""Helper for recording audit-log entries."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def record(
    db: AsyncSession,
    *,
    username: str,
    action: str,
    resource: str = "",
    method: str = "",
    status: str = "success",
    detail: str = "",
) -> None:
    """Persist an audit entry. Best-effort: never raises into the request path."""
    try:
        db.add(
            AuditLog(
                username=username,
                action=action,
                resource=resource,
                method=method,
                status=status,
                detail=detail[:2000],
            )
        )
        await db.commit()
    except Exception:
        await db.rollback()
