"""Snapshot API routes."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from aptly_webui.api.schemas import (
    SnapshotCreate,
    SnapshotCreateFromSource,
    SnapshotResponse,
    SnapshotDiff,
    APIResponse,
)
from aptly_webui.services.aptly_client import AptlyClient

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


async def get_aptly_client() -> AptlyClient:
    """Dependency to get Aptly client."""
    client = AptlyClient()
    try:
        yield client
    finally:
        await client.close()


@router.get("/", response_model=APIResponse)
async def list_snapshots(
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """List all snapshots."""
    snapshots = await client.list_snapshots()
    return {
        "success": True,
        "data": snapshots,
    }


@router.get("/{name}", response_model=APIResponse)
async def get_snapshot(
    name: str,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Get snapshot details."""
    try:
        snapshot = await client.get_snapshot(name)
        return {
            "success": True,
            "data": snapshot,
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Snapshot not found: {e}")


@router.post("/", response_model=APIResponse, status_code=201)
async def create_snapshot(
    data: SnapshotCreate,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Create a new snapshot from other snapshots."""
    try:
        result = await client.create_snapshot(data.model_dump(by_alias=True))
        return {
            "success": True,
            "data": result,
            "message": "Snapshot created successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/from-mirror/{mirror_name}", response_model=APIResponse, status_code=201)
async def create_snapshot_from_mirror(
    mirror_name: str,
    data: SnapshotCreateFromSource,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Create a snapshot from a mirror."""
    try:
        result = await client.create_snapshot_from_mirror(
            mirror_name, data.model_dump()
        )
        return {
            "success": True,
            "data": result,
            "message": "Snapshot created successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/from-repo/{repo_name}", response_model=APIResponse, status_code=201)
async def create_snapshot_from_repo(
    repo_name: str,
    data: SnapshotCreateFromSource,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Create a snapshot from a local repository."""
    try:
        result = await client.create_snapshot_from_repo(
            repo_name, data.model_dump()
        )
        return {
            "success": True,
            "data": result,
            "message": "Snapshot created successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{name}", response_model=APIResponse)
async def delete_snapshot(
    name: str,
    force: bool = Query(False),
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Delete a snapshot."""
    try:
        result = await client.delete_snapshot(name, force=force)
        return {
            "success": True,
            "data": result,
            "message": "Snapshot deleted successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{name}/diff/{other}", response_model=APIResponse)
async def diff_snapshots(
    name: str,
    other: str,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Compare two snapshots."""
    try:
        result = await client.diff_snapshots(name, other)
        return {
            "success": True,
            "data": result,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{name}/packages", response_model=APIResponse)
async def list_snapshot_packages(
    name: str,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """List packages in a snapshot."""
    try:
        packages = await client.list_snapshot_packages(name)
        return {
            "success": True,
            "data": packages,
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
