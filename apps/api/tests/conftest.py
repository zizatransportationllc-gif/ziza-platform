"""Test configuration — Sprint 4 / Sprint 46 hotfix / Sprint 54 hotfix.

Sets up an in-memory SQLite database for every test run.
Every test gets the ``get_db`` dependency overridden with an async session
backed by SQLite via aiosqlite.  Tests that don't use the DB at all are
unaffected (the override is always present but may never be invoked).

Sprint 34 hotfix: also patches ``app.db._SessionLocal`` directly so that
``/health`` (which no longer uses Depends(get_db)) can reach the test DB.

Sprint 46 hotfix: truncate all tables before each test to prevent cross-test
data pollution (e.g. an active city created by test_cities.py causing zone
enforcement to block estimate tests that use Abidjan coordinates).

Sprint 54 hotfix: patch ``crud.upsert_driver`` so that newly-created drivers
in tests start with ``status="active"`` instead of ``"pending_docs"``.
Production keeps ``pending_docs`` as the initial status; tests keep working
with the legacy trip-flow assumptions.
"""
import asyncio
from unittest.mock import patch

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

import app.crud as _crud_module

import app.db as _db_module
import app.models  # noqa: F401 — registers all models with Base.metadata
from app.config import settings as _settings
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


async def _truncate_all():
    """Delete every row from every table.

    SQLite does not support TRUNCATE — we use DELETE instead.
    FK enforcement is disabled for the duration so the order of deletions
    does not matter.
    """
    async with _engine.begin() as conn:
        await conn.execute(text("PRAGMA foreign_keys = OFF"))
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
        await conn.execute(text("PRAGMA foreign_keys = ON"))


# ---------------------------------------------------------------------------
# Per-test DB session + dependency override
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _override_db():
    """Override ``get_db`` for every test with an async SQLite session.

    Truncates all tables *before* each test so that data written by one test
    cannot affect another test (e.g. an active city created in test_cities.py
    must not cause zone-enforcement 422s in test_estimate.py).

    Also patches ``app.db._SessionLocal`` so the /health endpoint (which
    accesses _SessionLocal directly) can reach the in-memory test database.
    """
    # ── Clean slate before every test ──────────────────────────────────────
    _run(_truncate_all())

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


# ---------------------------------------------------------------------------
# Sprint 54 — make test drivers start as "active"
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _driver_starts_active():
    """Patch crud.upsert_driver so that newly-created drivers in tests get
    status='active' instead of 'pending_docs'.

    Production behaviour is preserved; tests that rely on the old assumption
    that a freshly-registered driver is immediately usable continue to work.
    """
    _original_upsert = _crud_module.upsert_driver

    async def _active_upsert(db, claims):
        driver, created = await _original_upsert(db, claims)
        if created and driver.status == "pending_docs":
            driver.status = "active"
            await db.commit()
            await db.refresh(driver)
        return driver, created

    with patch.object(_crud_module, "upsert_driver", _active_upsert):
        yield


# ---------------------------------------------------------------------------
# Sprint 70 — keep the (now-deprecated) internal withdrawal flow exercisable.
# Production disables self-service withdrawals by default (funds go to the
# payee's Stripe balance / Issuing card); the existing payout test suites still
# validate the mechanism, so enable it for tests. Individual tests can override.
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _enable_internal_withdrawals():
    original = _settings.internal_withdrawals_enabled
    _settings.internal_withdrawals_enabled = True
    try:
        yield
    finally:
        _settings.internal_withdrawals_enabled = original
