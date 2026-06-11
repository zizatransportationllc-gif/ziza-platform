"""Prod config fail-fast guard (Phase 0, Task 2).

Constructs ``Settings`` directly with patched env vars — deliberately NOT
reloading the ``app.config`` module, so the global ``settings`` singleton that
the rest of the app imported is never swapped out from under it (which would
desync ``app.main.settings`` from ``app.config.settings``).
"""
import pytest

from app.config import Settings


def test_prod_requires_jwt_secret(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "prod")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "ziza-prod")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("AUTH_DEV_SECRET", raising=False)
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings()


def test_prod_requires_firebase_project_id(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "prod")
    monkeypatch.setenv("JWT_SECRET", "x" * 32)
    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)
    with pytest.raises(ValueError, match="FIREBASE_PROJECT_ID"):
        Settings()


def test_dev_uses_defaults(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "dev")
    s = Settings()
    assert s.jwt_secret  # default acceptable en dev
