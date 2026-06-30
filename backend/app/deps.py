"""Shared FastAPI dependencies: aptly client, auth, and RBAC."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.aptly import AptlyClient
from app.db import get_db
from app.models import ROLE_LEVELS, User
from app.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=True)


async def get_aptly() -> AsyncGenerator[AptlyClient, None]:
    client = AptlyClient()
    try:
        yield client
    finally:
        await client.close()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user_id = payload.get("sub")
    user = await db.get(User, int(user_id)) if user_id and str(user_id).isdigit() else None
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or disabled")
    return user


def require_role(minimum: str):
    """Dependency factory enforcing a minimum role (viewer < operator < admin)."""
    needed = ROLE_LEVELS.get(minimum, 99)

    async def checker(user: User = Depends(get_current_user)) -> User:
        if ROLE_LEVELS.get(user.role, 0) < needed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Requires '{minimum}' role or higher",
            )
        return user

    return checker


# Convenience dependencies.
require_viewer = require_role("viewer")
require_operator = require_role("operator")
require_admin = require_role("admin")


async def get_user_by_username(db: AsyncSession, username: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()
