"""Sprint 2 — auth endpoint tests."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# POST /v1/token
# ---------------------------------------------------------------------------

def test_token_customer() -> None:
    resp = client.post("/v1/token", json={"email": "customer@ziza.dev", "password": "ziza2024"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["token_type"] == "bearer"
    assert len(data["access_token"]) > 10


def test_token_driver() -> None:
    resp = client.post("/v1/token", json={"email": "driver@ziza.dev", "password": "ziza2024"})
    assert resp.status_code == 200


def test_token_admin() -> None:
    resp = client.post("/v1/token", json={"email": "admin@ziza.dev", "password": "ziza2024"})
    assert resp.status_code == 200


def test_token_wrong_password() -> None:
    resp = client.post("/v1/token", json={"email": "customer@ziza.dev", "password": "wrong"})
    assert resp.status_code == 401


def test_token_unknown_email() -> None:
    resp = client.post("/v1/token", json={"email": "ghost@ziza.dev", "password": "ziza2024"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /v1/me
# ---------------------------------------------------------------------------

def _get_token(email: str) -> str:
    resp = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    return resp.json()["access_token"]


def test_me_customer() -> None:
    token = _get_token("customer@ziza.dev")
    resp = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "customer@ziza.dev"
    assert body["role"] == "customer"
    assert body["provider"] == "dev"


def test_me_driver() -> None:
    token = _get_token("driver@ziza.dev")
    resp = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "driver"


def test_me_admin() -> None:
    token = _get_token("admin@ziza.dev")
    resp = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"


def test_me_no_token() -> None:
    resp = client.get("/v1/me")
    # 401 (newer FastAPI) or 403 (FastAPI ≤0.115) — both mean "not authenticated"
    assert resp.status_code in {401, 403}


def test_me_invalid_token() -> None:
    resp = client.get("/v1/me", headers={"Authorization": "Bearer not-a-valid-jwt"})
    assert resp.status_code == 401
