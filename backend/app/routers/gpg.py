"""GPG signing-key management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app import audit
from app.aptly import gpg_manager
from app.config import settings
from app.db import get_db
from app.deps import require_operator, require_viewer
from app.models import User

router = APIRouter(prefix="/gpg", tags=["gpg"])


class GenerateKeyRequest(BaseModel):
    name: str = "Aptly Repository"
    email: str
    key_length: int = 4096


async def _refresh_public_key_export() -> None:
    """Re-export the served public key file after any keyring change."""
    await run_in_threadpool(gpg_manager.export_public_keys, settings.public_key_path)


@router.get("/keys")
async def list_keys(_: User = Depends(require_viewer)):
    return await run_in_threadpool(gpg_manager.list_keys)


@router.get("/public-key")
async def public_key(_: User = Depends(require_viewer)):
    """The armored public signing key(s), for apt client setup."""
    keys = await run_in_threadpool(gpg_manager.list_keys)
    if not keys:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No signing key present")
    import subprocess
    fps = [k["fingerprint"] for k in keys if k.get("fingerprint")]
    proc = await run_in_threadpool(
        lambda: subprocess.run(
            ["gpg", "--batch", "--yes", "--armor", "--export", *fps],
            capture_output=True, timeout=30,
        )
    )
    return Response(content=proc.stdout, media_type="text/plain")


@router.post("/keys/generate")
async def generate_key(
    body: GenerateKeyRequest,
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await run_in_threadpool(
            gpg_manager.generate_key, body.name, body.email, body.key_length
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Key generation failed: {exc}") from exc
    await _refresh_public_key_export()
    await audit.record(db, username=user.username, action="generate_gpg_key",
                       resource=body.email, method="POST")
    return result


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
    await _refresh_public_key_export()
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
    await _refresh_public_key_export()
    await audit.record(db, username=user.username, action="delete_gpg_key",
                       resource=fingerprint, method="DELETE")
    return result
