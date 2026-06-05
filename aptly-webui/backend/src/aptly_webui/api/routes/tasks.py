"""Task API routes."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from aptly_webui.api.schemas import APIResponse
from aptly_webui.services.aptly_client import AptlyClient

router = APIRouter(prefix="/tasks", tags=["tasks"])


async def get_aptly_client() -> AptlyClient:
    """Dependency to get Aptly client."""
    client = AptlyClient()
    try:
        yield client
    finally:
        await client.close()


@router.get("/", response_model=APIResponse)
async def list_tasks(
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """List all background tasks."""
    tasks = await client.list_tasks()
    return {
        "success": True,
        "data": tasks,
    }


@router.get("/{task_id}", response_model=APIResponse)
async def get_task(
    task_id: str,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Get task status."""
    try:
        task = await client.get_task(task_id)
        return {
            "success": True,
            "data": task,
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
