"""Sprint 4 — /v1/auth/register tests (real SQLite DB via conftest)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _get_token(email: str) -> str:
    resp = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


# ---------------------------------------------------------------------------
# Happy-path: upsert creates a new row
# ---------------------------------------------------------------------------

def test_register_customer() -> None:
    token = _get_token("customer@ziza.dev")
    resp = client.post("/v1/auth/register", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "customer@ziza.dev"
    assert body["role"] == "customer"
    assert body["provider"] == "dev"
    assert body["created"] is True


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
        body = resp.json()
        assert body["role"] == role
        assert body["created"] is True


# ---------------------------------------------------------------------------
# Idempotency: second call returns created=False
# ---------------------------------------------------------------------------

def test_register_idempotent() -> None:
    """Calling register twice with the same user returns created=False."""
    token = _get_token("customer@ziza.dev")
    headers = {"Authorization": f"Bearer {token}"}
    # Second call — same user already registered by test_register_customer
    resp = client.post("/v1/auth/register", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    # The DB fixture shares the same in-memory DB across the session, so the
    # row inserted in test_register_customer is still there.
    assert body["created"] is False
    assert body["email"] == "customer@ziza.dev"


# ---------------------------------------------------------------------------
# Auth guard
# ---------------------------------------------------------------------------

def test_register_requires_auth() -> None:
    resp = client.post("/v1/auth/register")
    # 401 (newer FastAPI) or 403 (FastAPI ≤0.115) — both mean "not authenticated"
    assert resp.status_code in {401, 403}
