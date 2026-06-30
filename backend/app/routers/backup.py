"""Backup and restore of aptly state plus the UI database.

Backups are tarballs of the aptly root directory and the UI's SQLite database,
stored under ``{data_dir}/backups``. Restore overwrites the aptly root, so it is
destructive and restricted to admins; aptly should be stopped during a restore.
"""

from __future__ import annotations

import os
import re
import tarfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app import audit
from app.config import settings
from app.db import get_db
from app.deps import require_admin, require_operator
from app.models import User

router = APIRouter(prefix="/backup", tags=["backup"])

_NAME_RE = re.compile(r"^aptly-webui-backup-[0-9]{8}-[0-9]{6}\.tar\.gz$")


def _backup_dir() -> str:
    path = os.path.join(settings.data_dir, "backups")
    os.makedirs(path, exist_ok=True)
    return path


def _safe_path(name: str) -> str:
    if not _NAME_RE.match(name):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid backup name")
    return os.path.join(_backup_dir(), name)


def _create_archive() -> dict:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    name = f"aptly-webui-backup-{stamp}.tar.gz"
    path = os.path.join(_backup_dir(), name)
    with tarfile.open(path, "w:gz") as tar:
        if os.path.isdir(settings.aptly_root_dir):
            tar.add(settings.aptly_root_dir, arcname="aptly")
        if os.path.exists(settings.db_path):
            tar.add(settings.db_path, arcname="webui/aptly_webui.db")
    return {"name": name, "size": os.path.getsize(path),
            "created": datetime.now(timezone.utc).isoformat()}


def _list_archives() -> list[dict]:
    items = []
    for fn in sorted(os.listdir(_backup_dir()), reverse=True):
        if not _NAME_RE.match(fn):
            continue
        full = os.path.join(_backup_dir(), fn)
        items.append({
            "name": fn,
            "size": os.path.getsize(full),
            "created": datetime.fromtimestamp(os.path.getmtime(full), tz=timezone.utc).isoformat(),
        })
    return items


def _restore_archive(path: str) -> None:
    parent = os.path.dirname(settings.aptly_root_dir.rstrip("/")) or "/"
    with tarfile.open(path, "r:gz") as tar:
        members = [m for m in tar.getmembers() if m.name.startswith("aptly/")]
        # Guard against path traversal in archive members.
        for m in members:
            target = os.path.realpath(os.path.join(parent, m.name))
            if not target.startswith(os.path.realpath(parent) + os.sep):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsafe archive member")
        tar.extractall(parent, members=members)


@router.get("")
async def list_backups(_: User = Depends(require_operator)):
    return await run_in_threadpool(_list_archives)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_backup(user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)):
    meta = await run_in_threadpool(_create_archive)
    await audit.record(db, username=user.username, action="create_backup",
                       resource=meta["name"], method="POST")
    return meta


@router.get("/{name}/download")
async def download_backup(name: str, _: User = Depends(require_operator)):
    path = _safe_path(name)
    if not os.path.exists(path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup not found")
    return FileResponse(path, filename=name, media_type="application/gzip")


@router.delete("/{name}")
async def delete_backup(name: str, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    path = _safe_path(name)
    if not os.path.exists(path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup not found")
    os.remove(path)
    await audit.record(db, username=user.username, action="delete_backup", resource=name, method="DELETE")
    return {"message": "Backup deleted"}


@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...), user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    if not (file.filename or "").endswith(".tar.gz"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Expected a .tar.gz backup file")
    tmp_path = os.path.join(_backup_dir(), f"_restore_{datetime.now(timezone.utc).timestamp()}.tar.gz")
    try:
        with open(tmp_path, "wb") as out:
            out.write(await file.read())
        await run_in_threadpool(_restore_archive, tmp_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    await audit.record(db, username=user.username, action="restore_backup",
                       resource=file.filename or "", method="POST")
    return {"message": "Restore complete. Restart aptly to load the restored data."}
