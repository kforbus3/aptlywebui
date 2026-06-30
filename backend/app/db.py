"""Async SQLAlchemy engine, session, and base model."""

from __future__ import annotations

import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


# Ensure the data directory exists before the engine opens the SQLite file.
os.makedirs(settings.data_dir, exist_ok=True)

engine = create_async_engine(settings.database_url, echo=False, future=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create tables if they do not exist."""
    from app import models  # noqa: F401  (register models on Base.metadata)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
