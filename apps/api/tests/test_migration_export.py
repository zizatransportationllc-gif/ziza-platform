"""Dry-run test for the bcrypt→Firebase export script (Phase 0, Task 14)."""
import base64

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import db as _db
from app.db import Base
from app.models.user import User
from scripts.migrate_bcrypt_to_firebase import _export


@pytest.fixture
def _file_db(tmp_path, monkeypatch):
    """A real on-disk SQLite DB with the schema, patched into app.db._SessionLocal."""
    url = f"sqlite+aiosqlite:///{tmp_path/'mig.db'}"
    engine = create_async_engine(url)
    import asyncio

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        sm = async_sessionmaker(engine, expire_on_commit=False)
        async with sm() as s:
            s.add(User(user_id="usr_local1", email="a@x.io", role="customer",
                       provider="local", password_hash="$2b$12$abcdefghijklmnopqrstuv"))
            s.add(User(user_id="fb_b", email="b@x.io", role="driver", provider="firebase"))
            await s.commit()
        return sm

    sm = asyncio.run(_setup())
    monkeypatch.setattr(_db, "_SessionLocal", sm)
    return sm


def test_export_only_local_users_base64(_file_db):
    import asyncio
    payload = asyncio.run(_export(raw=False))
    assert len(payload["users"]) == 1            # only the provider='local' account
    rec = payload["users"][0]
    assert rec["localId"] == "usr_local1"
    assert rec["email"] == "a@x.io"
    # passwordHash is the base64-encoding of the stored bcrypt string
    assert base64.b64decode(rec["passwordHash"]).decode() == "$2b$12$abcdefghijklmnopqrstuv"


def test_export_raw_emits_bcrypt_string(_file_db):
    import asyncio
    payload = asyncio.run(_export(raw=True))
    assert payload["users"][0]["passwordHash"] == "$2b$12$abcdefghijklmnopqrstuv"
