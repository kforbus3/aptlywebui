"""Publish API routes."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from aptly_webui.api.schemas import (
    PublishCreate,
    PublishSwitch,
    PublishUpdate,
    PublishResponse,
    APIResponse,
)
from aptly_webui.services.aptly_client import AptlyClient

router = APIRouter(prefix="/publish", tags=["publish"])


async def get_aptly_client() -> AptlyClient:
    """Dependency to get Aptly client."""
    client = AptlyClient()
    try:
        yield client
    finally:
        await client.close()


@router.get("/", response_model=APIResponse)
async def list_publish(
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """List all published repositories."""
    publish = await client.list_publish()
    return {
        "success": True,
        "data": publish,
    }


@router.post("/{prefix:path}", response_model=APIResponse, status_code=201)
async def publish_snapshot(
    prefix: str,
    data: PublishCreate,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Publish a snapshot."""
    try:
        result = await client.publish_snapshot(prefix, data.model_dump(by_alias=True))
        return {
            "success": True,
            "data": result,
            "message": "Snapshot published successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{prefix:path}/{distribution}", response_model=APIResponse)
async def switch_publish(
    prefix: str,
    distribution: str,
    data: PublishSwitch,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Switch published snapshot."""
    try:
        result = await client.switch_publish(
            f"{prefix}/{distribution}" if prefix else distribution,
            distribution,
            data.model_dump(by_alias=True),
        )
        return {
            "success": True,
            "data": result,
            "message": "Published snapshot switched successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{prefix:path}/{distribution}", response_model=APIResponse)
async def update_publish(
    prefix: str,
    distribution: str,
    data: PublishUpdate,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Update published repository."""
    try:
        result = await client.update_publish(
            f"{prefix}/{distribution}" if prefix else distribution,
            distribution,
            data.model_dump(),
        )
        return {
            "success": True,
            "data": result,
            "message": "Published repository updated successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{prefix:path}/{distribution}", response_model=APIResponse)
async def delete_publish(
    prefix: str,
    distribution: str,
    force: bool = Query(False),
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Unpublish a repository."""
    try:
        result = await client.delete_publish(
            f"{prefix}/{distribution}" if prefix else distribution,
            distribution,
            force=force,
        )
        return {
            "success": True,
            "data": result,
            "message": "Published repository deleted successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
