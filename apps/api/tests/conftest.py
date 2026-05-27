"""Test configuration — Sprint 4.

Sets up an in-memory SQLite database for every test run.
Every test gets the ``get_db`` dependency overridden with an async session
backed by SQLite via aiosqlite.  Tests that don't use the DB at all are
unaffected (the override is always present but may never be invoked).

Sprint 34 hotfix: also patches ``app.db._SessionLocal`` directly so that
``/health`` (which no longer uses Depends(get_db)) can reach the test DB.
"""
import asyncio

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

import app.db as _db_module
import app.models  # noqa: F401 — registers all models with Base.metadata
from app.db import Base, get_db, get_db_optional
from app.main import app

_TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

# ---------------------------------------------------------------------------
# Module-level engine: created once for the whole test session.
# We use asyncio.run() which is safe in Python 3.10+.
# ---------------------------------------------------------------------------

_engine = create_async_engine(_TEST_DB_URL, echo=False)


def _run(coro):
    """Run a coroutine synchronously using a fresh event loop."""
    return asyncio.run(coro)


async def _create_tables():
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# Create tables once when this conftest module is loaded.
_run(_create_tables())


# ---------------------------------------------------------------------------
# Per-test DB session + dependency override
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _override_db():
    """Override ``get_db`` for every test with an async SQLite session.

    Also patches ``app.db._SessionLocal`` so the /health endpoint (which
    accesses _SessionLocal directly) can reach the in-memory test database.
    """
    _Session = async_sessionmaker(_engine, expire_on_commit=False)

    async def _mock_get_db():
        async with _Session() as session:
            yield session

    app.dependency_overrides[get_db] = _mock_get_db
    # Also override get_db_optional so /v1/token and /v1/me use the test DB
    app.dependency_overrides[get_db_optional] = _mock_get_db

    # Patch _SessionLocal so /health works without Depends(get_db)
    _original_session_local = _db_module._SessionLocal
    _db_module._SessionLocal = _Session

    yield

    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_db_optional, None)
    _db_module._SessionLocal = _original_session_local
