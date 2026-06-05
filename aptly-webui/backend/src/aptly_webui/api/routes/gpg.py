"""GPG key API routes."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from aptly_webui.api.schemas import GPGKey, GPGKeyImport, APIResponse
from aptly_webui.services.aptly_client import GPGManager

router = APIRouter(prefix="/gpg", tags=["gpg"])


def get_gpg_manager() -> GPGManager:
    """Dependency to get GPG manager."""
    return GPGManager()


@router.get("/keys", response_model=APIResponse)
async def list_gpg_keys(
    manager: GPGManager = Depends(get_gpg_manager),
) -> dict[str, Any]:
    """List all GPG keys."""
    keys = manager.list_keys()
    return {
        "success": True,
        "data": keys,
    }


@router.post("/keys", response_model=APIResponse, status_code=201)
async def import_gpg_key(
    file: UploadFile = File(...),
    manager: GPGManager = Depends(get_gpg_manager),
) -> dict[str, Any]:
    """Import a GPG key from file."""
    try:
        content = await file.read()
        result = manager.import_key(content, file.filename or "key.asc")
        return {
            "success": True,
            "data": result,
            "message": f"Key {file.filename} imported successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/keys/{fingerprint}", response_model=APIResponse)
async def delete_gpg_key(
    fingerprint: str,
    manager: GPGManager = Depends(get_gpg_manager),
) -> dict[str, Any]:
    """Delete a GPG key."""
    try:
        result = manager.delete_key(fingerprint)
        return {
            "success": True,
            "data": result,
            "message": "GPG key deleted successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
