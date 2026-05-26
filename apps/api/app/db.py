"""Async SQLAlchemy engine, session factory, and declarative base.

DATABASE_URL must be set in the environment.  When not set (e.g. CI without a
Postgres instance), the engine is left as None and endpoints that call
``get_db()`` raise HTTP 503 automatically.

Supported URL schemes:
  postgresql+asyncpg://user:pass@host/db          (standard)
  postgresql://user:pass@host/db                  (auto-upgraded to asyncpg)
  postgres://user:pass@host/db                    (Heroku/legacy, auto-upgraded)
  postgresql+asyncpg://user:pass@/db?host=/cloudsql/... (Cloud SQL unix socket)
"""
import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


# ---------------------------------------------------------------------------
# Declarative base — imported by every model module
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Engine + session factory
# ---------------------------------------------------------------------------

def _normalise_url(raw: str) -> str:
    """Ensure the URL uses the asyncpg driver."""
    if raw.startswith("postgres://"):
        return raw.replace("postgres://", "postgresql+asyncpg://", 1)
    if raw.startswith("postgresql://") and "+asyncpg" not in raw:
        return raw.replace("postgresql://", "postgresql+asyncpg://", 1)
    return raw


DATABASE_URL: str | None = os.getenv("DATABASE_URL")
if DATABASE_URL:
    DATABASE_URL = _normalise_url(DATABASE_URL)

def _engine_kwargs(url: str) -> dict:
    """Return engine kwargs tuned for PostgreSQL in production."""
    kwargs: dict = {"echo": False, "pool_pre_ping": True}
    if "postgresql" in url or "asyncpg" in url:
        # Connection pool tuning — Sprint 31 SRE hardening
        kwargs["pool_size"] = 10
        kwargs["max_overflow"] = 20
        kwargs["pool_recycle"] = 3600  # recycle connections every hour
    return kwargs


_engine = (
    create_async_engine(DATABASE_URL, **_engine_kwargs(DATABASE_URL))
    if DATABASE_URL
    else None
)
_SessionLocal: async_sessionmaker[AsyncSession] | None = (
    async_sessionmaker(_engine, expire_on_commit=False)
    if _engine
    else None
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async DB session.

    Raises HTTP 503 if DATABASE_URL is not configured.
    """
    if _SessionLocal is None:
        from fastapi import HTTPException  # noqa: PLC0415

        raise HTTPException(status_code=503, detail="Database not configured")
    async with _SessionLocal() as session:
        yield session
