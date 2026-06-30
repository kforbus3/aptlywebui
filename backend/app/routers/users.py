"""User management (admin only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import audit
from app.db import get_db
from app.deps import require_admin
from app.models import ROLE_LEVELS, User
from app.schemas import UserCreate, UserResponse, UserUpdate
from app.security import get_password_hash, validate_password_strength

router = APIRouter(prefix="/users", tags=["users"])


def _validate_role(role: str) -> None:
    if role not in ROLE_LEVELS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid role; choose one of {list(ROLE_LEVELS)}")


@router.get("", response_model=list[UserResponse])
async def list_users(_: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.id))
    return list(result.scalars().all())


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    _validate_role(body.role)
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    ok, msg = validate_password_strength(body.password)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, msg)
    user = User(
        username=body.username,
        email=body.email,
        role=body.role,
        hashed_password=get_password_hash(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await audit.record(db, username=admin.username, action="create_user", resource=body.username, method="POST")
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int, body: UserUpdate, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if body.role is not None:
        _validate_role(body.role)
        user.role = body.role
    if body.email is not None:
        user.email = body.email
    if body.is_active is not None:
        # Prevent locking out the last active admin.
        if not body.is_active and user.role == "admin":
            await _guard_last_admin(db, user)
        user.is_active = body.is_active
    if body.password:
        ok, msg = validate_password_strength(body.password)
        if not ok:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, msg)
        user.hashed_password = get_password_hash(body.password)
    await db.commit()
    await db.refresh(user)
    await audit.record(db, username=admin.username, action="update_user", resource=user.username, method="PATCH")
    return user


@router.delete("/{user_id}")
async def delete_user(
    user_id: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account")
    if user.role == "admin":
        await _guard_last_admin(db, user)
    await db.delete(user)
    await db.commit()
    await audit.record(db, username=admin.username, action="delete_user", resource=user.username, method="DELETE")
    return {"message": "User deleted"}


async def _guard_last_admin(db: AsyncSession, target: User) -> None:
    result = await db.execute(select(User).where(User.role == "admin", User.is_active == True))  # noqa: E712
    admins = [u for u in result.scalars().all() if u.id != target.id]
    if not admins:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot remove the last active admin")
