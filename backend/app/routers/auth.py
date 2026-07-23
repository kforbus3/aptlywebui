"""Authentication: login, token refresh, current user, password change."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from app import audit
from app.db import get_db
from app.deps import get_current_user, get_user_by_username
from app.models import User
from app.schemas import PasswordChange, RefreshRequest, TokenResponse, UserResponse
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    validate_password_strength,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# A precomputed bcrypt hash of a dummy password. Verifying against it on the
# user-not-found path keeps login timing constant, closing the username
# enumeration oracle (an existing user's wrong password would otherwise take
# markedly longer than a non-existent username).
_DUMMY_HASH = get_password_hash("aptly-webui-timing-equalizer")


def _tokens(user: User) -> TokenResponse:
    claims = {"role": user.role, "username": user.username}
    return TokenResponse(
        access_token=create_access_token(user.id, extra_claims=claims),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    user = await get_user_by_username(db, form.username)
    # Always run a bcrypt verify so response time doesn't reveal whether the
    # username exists.
    password_ok = verify_password(form.password, user.hashed_password if user else _DUMMY_HASH)
    if not user or not password_ok:
        await audit.record(
            db, username=form.username, action="login", status="failure", detail="bad credentials"
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")
    await audit.record(db, username=user.username, action="login")
    return _tokens(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = await db.get(User, int(payload["sub"])) if str(payload.get("sub", "")).isdigit() else None
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or disabled")
    return _tokens(user)


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/change-password")
async def change_password(
    body: PasswordChange,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    ok, msg = validate_password_strength(body.new_password)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, msg)
    user.hashed_password = get_password_hash(body.new_password)
    await db.commit()
    await audit.record(db, username=user.username, action="change_password")
    return {"message": "Password updated"}
