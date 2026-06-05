"""Local repository API routes."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from aptly_webui.api.schemas import RepoCreate, RepoResponse, APIResponse
from aptly_webui.services.aptly_client import AptlyClient

router = APIRouter(prefix="/repos", tags=["repos"])


async def get_aptly_client() -> AptlyClient:
    """Dependency to get Aptly client."""
    client = AptlyClient()
    try:
        yield client
    finally:
        await client.close()


@router.get("/", response_model=APIResponse)
async def list_repos(
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """List all local repositories."""
    repos = await client.list_repos()
    return {
        "success": True,
        "data": repos,
    }


@router.post("/", response_model=APIResponse, status_code=201)
async def create_repo(
    data: RepoCreate,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Create a new local repository."""
    try:
        result = await client.create_repo(data.model_dump())
        return {
            "success": True,
            "data": result,
            "message": "Repository created successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{name}", response_model=APIResponse)
async def delete_repo(
    name: str,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Delete a local repository."""
    try:
        result = await client.delete_repo(name)
        return {
            "success": True,
            "data": result,
            "message": "Repository deleted successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{name}/packages", response_model=APIResponse)
async def list_repo_packages(
    name: str,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """List packages in a local repository."""
    try:
        packages = await client.list_repo_packages(name)
        return {
            "success": True,
            "data": packages,
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{name}/add", response_model=APIResponse)
async def add_packages_to_repo(
    name: str,
    temp_dir: str,
    force_replace: bool = False,
    client: AptlyClient = Depends(get_aptly_client),
) -> dict[str, Any]:
    """Add uploaded packages to a local repository."""
    try:
        result = await client.add_packages_to_repo(name, temp_dir, force_replace)
        return {
            "success": True,
            "data": result,
            "message": "Packages added to repository",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
