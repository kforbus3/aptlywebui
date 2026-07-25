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
    """Create tables if they do not exist, then apply lightweight column adds."""
    from app import models  # noqa: F401  (register models on Base.metadata)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)


def _add_missing_columns(conn) -> None:
    """create_all never alters existing tables, so add columns introduced by
    later versions here. Idempotent: only adds a column when it's absent."""
    from sqlalchemy import inspect, text

    additions = {
        "schedules": {
            "kind": "VARCHAR(32) NOT NULL DEFAULT 'mirror'",
            "targets": "TEXT NOT NULL DEFAULT ''",
            "retention": "INTEGER NOT NULL DEFAULT 7",
            "gpg_key": "VARCHAR(64) NOT NULL DEFAULT ''",
        },
    }
    inspector = inspect(conn)
    tables = set(inspector.get_table_names())
    for table, cols in additions.items():
        if table not in tables:
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        for col, ddl in cols.items():
            if col not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
