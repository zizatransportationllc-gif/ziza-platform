"""Sprint 3 — /v1/auth/register tests."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _get_token(email: str) -> str:
    resp = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    return resp.json()["access_token"]


def test_register_customer() -> None:
    token = _get_token("customer@ziza.dev")
    resp = client.post("/v1/auth/register", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "customer@ziza.dev"
    assert body["role"] == "customer"
    assert body["provider"] == "dev"
    assert body["created"] is True


def test_register_requires_auth() -> None:
    resp = client.post("/v1/auth/register")
    assert resp.status_code == 403


def test_register_all_roles() -> None:
    for email, role in [
        ("driver@ziza.dev", "driver"),
        ("admin@ziza.dev", "admin"),
    ]:
        token = _get_token(email)
        resp = client.post(
            "/v1/auth/register",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == role
