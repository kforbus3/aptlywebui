"""Authentication API routes."""

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from aptly_webui.api.schemas import TokenResponse, UserLogin, UserRegister, UserResponse, APIResponse
from aptly_webui.core.config import settings
from aptly_webui.core.security import create_access_token, create_refresh_token, verify_password, get_password_hash
from aptly_webui.db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


# Simple in-memory user store for now (will be replaced with database)
# In production, use the database models
USERS_DB: dict[str, dict[str, Any]] = {}


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> dict[str, Any]:
    """Authenticate user and return JWT tokens."""
    # Check credentials (simplified - should query database)
    user = USERS_DB.get(form_data.username)
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create tokens
    access_token = create_access_token(
        subject=user["id"],
        extra_claims={"email": user["email"], "role": user["role"]},
    )
    refresh_token = create_refresh_token(subject=user["id"])

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
    }


@router.post("/register", response_model=APIResponse, status_code=201)
async def register(
    data: UserRegister,
) -> dict[str, Any]:
    """Register a new user."""
    if data.email in USERS_DB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create user
    from uuid import uuid4
    user_id = str(uuid4())
    USERS_DB[data.email] = {
        "id": user_id,
        "email": data.email,
        "hashed_password": get_password_hash(data.password),
        "full_name": data.full_name,
        "role": "viewer",
        "is_active": True,
    }

    return {
        "success": True,
        "message": "User registered successfully",
        "data": {"id": user_id, "email": data.email},
    }


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_token: str,
) -> dict[str, Any]:
    """Refresh access token."""
    from aptly_webui.core.security import decode_token

    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user_id = payload.get("sub")
    # Get user from database (simplified)
    user = None
    for u in USERS_DB.values():
        if u["id"] == user_id:
            user = u
            break

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Create new tokens
    access_token = create_access_token(
        subject=user["id"],
        extra_claims={"email": user["email"], "role": user["role"]},
    )
    new_refresh_token = create_refresh_token(subject=user["id"])

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user() -> dict[str, Any]:
    """Get current authenticated user."""
    # This should require authentication
    # For now, return a placeholder
    return {
        "id": "placeholder",
        "email": "user@example.com",
        "full_name": "Test User",
        "role": "admin",
        "is_active": True,
        "created_at": "2024-01-01T00:00:00Z",
    }


@router.post("/logout", response_model=APIResponse)
async def logout() -> dict[str, Any]:
    """Logout user (invalidate token on client side)."""
    # JWT tokens are stateless, so we just return success
    # Client should remove tokens from storage
    return {
        "success": True,
        "message": "Logged out successfully",
    }
