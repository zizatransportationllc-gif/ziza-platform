import importlib
import pytest


def _reload_settings(monkeypatch, **env):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    import app.config as cfg
    return importlib.reload(cfg)


def test_prod_requires_jwt_secret(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "prod")
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "ziza-prod")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("AUTH_DEV_SECRET", raising=False)
    with pytest.raises(ValueError, match="JWT_SECRET"):
        _reload_settings(monkeypatch)


def test_prod_requires_firebase_project_id(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "prod")
    monkeypatch.setenv("JWT_SECRET", "x" * 32)
    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)
    with pytest.raises(ValueError, match="FIREBASE_PROJECT_ID"):
        _reload_settings(monkeypatch)


def test_dev_uses_defaults(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "dev")
    cfg = _reload_settings(monkeypatch)
    assert cfg.settings.jwt_secret
