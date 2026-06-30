"""Seed the first admin user on a fresh database."""

from __future__ import annotations

import logging

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import User
from app.security import get_password_hash

logger = logging.getLogger("aptly-webui")


async def seed_admin() -> None:
    async with SessionLocal() as db:
        existing = await db.execute(select(User).limit(1))
        if existing.scalar_one_or_none():
            return
        admin = User(
            username=settings.admin_username,
            email=settings.admin_email,
            role="admin",
            hashed_password=get_password_hash(settings.admin_password),
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        logger.warning(
            "Seeded initial admin user '%s'. CHANGE THE PASSWORD IMMEDIATELY after first login.",
            settings.admin_username,
        )
