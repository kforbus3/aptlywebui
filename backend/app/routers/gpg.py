"""GPG signing-key management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app import audit
from app.aptly import gpg_manager
from app.db import get_db
from app.deps import require_operator, require_viewer
from app.models import User

router = APIRouter(prefix="/gpg", tags=["gpg"])


@router.get("/keys")
async def list_keys(_: User = Depends(require_viewer)):
    return await run_in_threadpool(gpg_manager.list_keys)


@router.post("/keys")
async def import_key(
    file: UploadFile = File(...),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    try:
        result = await run_in_threadpool(gpg_manager.import_key, content, file.filename or "key.asc")
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Import failed: {exc}") from exc
    await audit.record(db, username=user.username, action="import_gpg_key", method="POST")
    return result


@router.delete("/keys/{fingerprint}")
async def delete_key(
    fingerprint: str,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await run_in_threadpool(gpg_manager.delete_key, fingerprint)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Delete failed: {exc}") from exc
    await audit.record(db, username=user.username, action="delete_gpg_key",
                       resource=fingerprint, method="DELETE")
    return result
