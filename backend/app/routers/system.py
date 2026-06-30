"""System health and dashboard summary."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app import __version__
from app.aptly import AptlyClient, AptlyError
from app.deps import get_aptly, require_viewer
from app.models import User

router = APIRouter(tags=["system"])


@router.get("/health")
async def health():
    """Unauthenticated liveness probe."""
    return {"status": "ok", "version": __version__}


@router.get("/system/aptly")
async def aptly_status(aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    """Report aptly API reachability and version."""
    try:
        version = await aptly.version()
        return {"connected": True, "version": version.get("Version", "unknown")}
    except AptlyError as exc:
        return {"connected": False, "error": str(exc)}


@router.get("/system/summary")
async def summary(aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    """Dashboard counts across aptly resources."""
    async def _count(coro):
        try:
            data = await coro
            return len(data) if isinstance(data, list) else 0
        except AptlyError:
            return 0

    return {
        "mirrors": await _count(aptly.list_mirrors()),
        "repos": await _count(aptly.list_repos()),
        "snapshots": await _count(aptly.list_snapshots()),
        "published": await _count(aptly.list_publish()),
    }
