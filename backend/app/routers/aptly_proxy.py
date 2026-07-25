"""Proxy endpoints for aptly resources, with RBAC and audit logging.

Read operations require the ``viewer`` role; mutating operations require
``operator`` or higher and are recorded in the audit log.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Body, Depends, File, Form, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app import audit
from app.aptly import AptlyClient, _clean_prefix, fetch_release_date, mirror_of_snapshot
from app.db import get_db
from app.deps import get_aptly, require_operator, require_viewer
from app.models import User

router = APIRouter(tags=["aptly"])


# ----------------------------- Mirrors -----------------------------
@router.get("/mirrors")
async def list_mirrors(aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.list_mirrors()


@router.get("/mirrors/overview")
async def mirrors_overview(aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    """Mirror list enriched with last-sync (native LastDownloadDate) and
    last-published time. A mirror's last-published time is the newest Release
    Date among the publications whose snapshots trace back to it — since aptly
    never publishes a mirror directly, only its snapshots.

    NOTE: declared before /mirrors/{name} so "overview" isn't captured as a name.
    """
    mirrors = await aptly.list_mirrors()
    pubs = await aptly.list_publish()
    snaps = await aptly.list_snapshots()
    snap_by_name = {s.get("Name"): s for s in snaps}

    # Read every publication's Release Date concurrently (one HTTP GET each).
    dates = await asyncio.gather(
        *(fetch_release_date(p.get("Prefix", ""), p.get("Distribution", "")) for p in pubs)
    )

    # mirror name -> {publication label: release-date-or-None}
    by_mirror: dict[str, dict[str, str | None]] = defaultdict(dict)
    for pub, date in zip(pubs, dates):
        prefix = _clean_prefix(pub.get("Prefix", ""))
        dist = pub.get("Distribution", "")
        label = dist if not prefix else f"{prefix}/{dist}"
        for src in pub.get("Sources") or []:
            mirror = mirror_of_snapshot(snap_by_name.get(src.get("Name")))
            if mirror:
                by_mirror[mirror][label] = date

    enriched = []
    for m in mirrors:
        pubs_for = by_mirror.get(m.get("Name"), {})
        valid = [d for d in pubs_for.values() if d]
        item = dict(m)
        item["LastPublished"] = max(valid) if valid else None
        item["PublishedIn"] = sorted(pubs_for.keys())
        enriched.append(item)
    return enriched


@router.get("/mirrors/{name}")
async def get_mirror(name: str, aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.get_mirror(name)


@router.get("/mirrors/{name}/packages")
async def mirror_packages(name: str, aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.list_mirror_packages(name)


@router.post("/mirrors")
async def create_mirror(
    data: dict[str, Any] = Body(...),
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
):
    result = await aptly.create_mirror(data)
    await audit.record(db, username=user.username, action="create_mirror",
                       resource=data.get("Name", ""), method="POST")
    return result


@router.put("/mirrors/{name}")
async def update_mirror(
    name: str, data: dict[str, Any] = Body(...),
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    result = await aptly.update_mirror(name, data)
    await audit.record(db, username=user.username, action="update_mirror", resource=name, method="PUT")
    return result


@router.post("/mirrors/{name}/update")
async def sync_mirror(
    name: str, data: dict[str, Any] = Body(default={}),
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    result = await aptly.update_mirror_packages(name, data)
    await audit.record(db, username=user.username, action="sync_mirror", resource=name, method="POST")
    return result


@router.delete("/mirrors/{name}")
async def delete_mirror(
    name: str, force: bool = False,
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    result = await aptly.delete_mirror(name, force=force)
    await audit.record(db, username=user.username, action="delete_mirror", resource=name, method="DELETE")
    return result


# ----------------------------- Local repos -----------------------------
@router.get("/repos")
async def list_repos(aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.list_repos()


@router.get("/repos/{name}/packages")
async def repo_packages(name: str, aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.list_repo_packages(name)


@router.post("/repos")
async def create_repo(
    data: dict[str, Any] = Body(...),
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    result = await aptly.create_repo(data)
    await audit.record(db, username=user.username, action="create_repo",
                       resource=data.get("Name", ""), method="POST")
    return result


@router.delete("/repos/{name}")
async def delete_repo(
    name: str, force: bool = False,
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    result = await aptly.delete_repo(name, force=force)
    await audit.record(db, username=user.username, action="delete_repo", resource=name, method="DELETE")
    return result


@router.delete("/repos/{name}/packages")
async def remove_repo_packages(
    name: str, data: dict[str, Any] = Body(...),
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    refs = data.get("PackageRefs") or []
    result = await aptly.remove_repo_packages(name, refs)
    await audit.record(db, username=user.username, action="remove_packages", resource=name,
                       method="DELETE", detail=f"{len(refs)} package ref(s)")
    return result


@router.post("/repos/{name}/upload")
async def upload_to_repo(
    name: str,
    files: list[UploadFile] = File(...),
    force_replace: bool = Form(False),
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    payloads = [(f.filename or "package.deb", await f.read(), f.content_type or "application/octet-stream") for f in files]
    upload_dir = f"upload_{name}"
    await aptly.upload_files(payloads, temp_dir=upload_dir)
    result = await aptly.add_packages_to_repo(name, upload_dir, force_replace=force_replace)
    await audit.record(db, username=user.username, action="upload_packages", resource=name,
                       method="POST", detail=f"{len(payloads)} file(s)")
    return result


# ----------------------------- Snapshots -----------------------------
@router.get("/snapshots")
async def list_snapshots(aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.list_snapshots()


@router.get("/snapshots/{name}")
async def get_snapshot(name: str, aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.get_snapshot(name)


@router.get("/snapshots/{name}/packages")
async def snapshot_packages(name: str, aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.list_snapshot_packages(name)


@router.get("/snapshots/{name}/diff/{other}")
async def diff_snapshots(name: str, other: str, aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.diff_snapshots(name, other)


@router.post("/snapshots")
async def create_snapshot(
    data: dict[str, Any] = Body(...),
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    result = await aptly.create_snapshot(data)
    await audit.record(db, username=user.username, action="create_snapshot",
                       resource=data.get("Name", ""), method="POST")
    return result


@router.post("/snapshots/from-mirror/{mirror}")
async def snapshot_from_mirror(
    mirror: str, data: dict[str, Any] = Body(...),
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    result = await aptly.create_snapshot_from_mirror(mirror, data)
    await audit.record(db, username=user.username, action="snapshot_from_mirror",
                       resource=data.get("Name", mirror), method="POST")
    return result


@router.post("/snapshots/from-repo/{repo}")
async def snapshot_from_repo(
    repo: str, data: dict[str, Any] = Body(...),
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    result = await aptly.create_snapshot_from_repo(repo, data)
    await audit.record(db, username=user.username, action="snapshot_from_repo",
                       resource=data.get("Name", repo), method="POST")
    return result


@router.delete("/snapshots/{name}")
async def delete_snapshot(
    name: str, force: bool = False,
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    result = await aptly.delete_snapshot(name, force=force)
    await audit.record(db, username=user.username, action="delete_snapshot", resource=name, method="DELETE")
    return result


# ----------------------------- Publish -----------------------------
@router.get("/publish")
async def list_publish(aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.list_publish()


@router.post("/publish/{prefix}")
async def publish(
    prefix: str, data: dict[str, Any] = Body(...),
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    # Run as a background aptly task so the request returns immediately with a
    # task the UI polls; a large publish would otherwise exceed the HTTP timeout.
    result = await aptly.publish_snapshot(prefix, data, async_=True)
    await audit.record(db, username=user.username, action="publish", resource=prefix, method="POST")
    return result


@router.put("/publish/{prefix}/{distribution}")
async def update_publish(
    prefix: str, distribution: str, data: dict[str, Any] = Body(...),
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    result = await aptly.update_publish(prefix, distribution, data, async_=True)
    await audit.record(db, username=user.username, action="switch_publish",
                       resource=f"{prefix}/{distribution}", method="PUT")
    return result


@router.delete("/publish/{prefix}/{distribution}")
async def unpublish(
    prefix: str, distribution: str, force: bool = False,
    aptly: AptlyClient = Depends(get_aptly),
    user: User = Depends(require_operator), db: AsyncSession = Depends(get_db),
):
    result = await aptly.delete_publish(prefix, distribution, force=force)
    await audit.record(db, username=user.username, action="unpublish",
                       resource=f"{prefix}/{distribution}", method="DELETE")
    return result


# ----------------------------- Packages / tasks / graph -----------------------------
@router.get("/packages/{key:path}")
async def get_package(key: str, aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.get_package(key)


@router.get("/tasks")
async def list_tasks(aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.list_tasks()


@router.get("/tasks/{task_id}")
async def get_task(task_id: str, aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return await aptly.get_task(task_id)


@router.get("/tasks/{task_id}/output")
async def task_output(task_id: str, aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    return {"output": await aptly.get_task_output(task_id)}


@router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_operator)):
    return await aptly.delete_task(task_id)


@router.get("/graph")
async def graph(aptly: AptlyClient = Depends(get_aptly), _: User = Depends(require_viewer)):
    svg = await aptly.get_graph()
    return Response(content=svg, media_type="image/svg+xml")
