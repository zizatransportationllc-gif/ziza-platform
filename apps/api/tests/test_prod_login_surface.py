"""Phase 0 regression lock — prod login surface.

In production, the only login path is POST /v1/auth/firebase (Firebase identity
exchanged for a Ziza JWT). The DEV-only password endpoints must stay disabled:
- POST /v1/token        → 404 in prod
- POST /v1/auth/signup  → 404 in prod

These tests codify that contract so a future change cannot silently re-expose
password login (and the seeded dev credentials) in production.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_token_endpoint_404_in_prod(monkeypatch):
    monkeypatch.setattr("app.main.settings.environment", "prod")
    r = client.post("/v1/token", json={"email": "admin@ziza.dev", "password": "ziza2024"})
    assert r.status_code == 404


def test_signup_endpoint_404_in_prod(monkeypatch):
    monkeypatch.setattr("app.main.settings.environment", "prod")
    r = client.post("/v1/auth/signup", json={"email": "x@y.io", "password": "secret123"})
    assert r.status_code == 404
