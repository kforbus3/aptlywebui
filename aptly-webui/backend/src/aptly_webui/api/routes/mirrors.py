"""Mirror API routes."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File

from aptly_webui.api.schemas import (
    MirrorCreate,
    MirrorUpdate,
    MirrorResponse,
    MirrorUpdatePayload,
    APIResponse,
    PaginatedResponse,
    PaginationParams,
)
from aptly_webui.services.aptly_client import AptlyClient

router = APIRouter(prefix="/mirrors", tags=["mirrors"])


async def get_aptly_client() -> AptlyClient:
    """Dependency to get Aptly client."""
    client = AptlyClient()
    try:
        yield client
    finally:
        await client.close()


@router.get("/", response_model=APIResponse)
async def list_mirrors(
    client: AptlyClient = Depends(get_aptly_client),
    pagination: PaginationParams = Depends(),
) -> dict[str, Any]:
    """List all mirrors."""
    mirrors = await client.list_mirrors()
    return {
        "success": True,
        "data": mirrors,
    }


@router.get("/{name}", response_model=APIResponse)
async def get_mirror(
    name: str,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Get mirror details."""
    try:
        mirror = await client.get_mirror(name)
        return {
            "success": True,
            "data": mirror,
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Mirror not found: {e}")


@router.post("/", response_model=APIResponse, status_code=201)
async def create_mirror(
    data: MirrorCreate,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Create a new mirror."""
    try:
        result = await client.create_mirror(data.model_dump(by_alias=True))
        return {
            "success": True,
            "data": result,
            "message": "Mirror created successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{name}", response_model=APIResponse)
async def update_mirror(
    name: str,
    data: MirrorUpdate,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Update mirror configuration."""
    try:
        result = await client.update_mirror(name, data.model_dump(by_alias=True))
        return {
            "success": True,
            "data": result,
            "message": "Mirror updated successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{name}", response_model=APIResponse)
async def delete_mirror(
    name: str,
    force: bool = Query(False),
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Delete a mirror."""
    try:
        result = await client.delete_mirror(name, force=force)
        return {
            "success": True,
            "data": result,
            "message": "Mirror deleted successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{name}/update", response_model=APIResponse)
async def update_mirror_packages(
    name: str,
    data: MirrorUpdatePayload | None = None,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Trigger mirror update (sync packages)."""
    try:
        payload = data.model_dump() if data else {}
        result = await client.update_mirror_packages(name, payload)
        return {
            "success": True,
            "data": result,
            "message": "Mirror update started",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{name}/packages", response_model=APIResponse)
async def list_mirror_packages(
    name: str,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """List packages in a mirror."""
    try:
        packages = await client.list_mirror_packages(name)
        return {
            "success": True,
            "data": packages,
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
