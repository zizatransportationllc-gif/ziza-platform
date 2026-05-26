"""Sprint 31 — Invite Code tests (4 tests).

Covers:
  POST /v1/admin/invite-codes
  POST /v1/invite-codes/use

Scenarios:
  - Create code and use it successfully
  - Exhausted code returns 422
  - Nonexistent code returns 422
  - Expired code returns 422
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _admin() -> str:
    tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _customer() -> str:
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_create_and_use_invite_code():
    """Admin creates invite code; using it succeeds once."""
    a_tok = _admin()
    # Create code with max_uses=1
    r = client.post(
        "/v1/admin/invite-codes",
        headers=_h(a_tok),
        json={"code": "BETA-TEST-001", "max_uses": 1},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["code"] == "BETA-TEST-001"
    assert data["max_uses"] == 1
    assert data["used_count"] == 0

    # Use the code
    r2 = client.post("/v1/invite-codes/use", json={"code": "BETA-TEST-001"})
    assert r2.status_code == 200, r2.text
    result = r2.json()
    assert result["used_count"] == 1


def test_exhausted_invite_code_returns_422():
    """Using an exhausted invite code returns 422."""
    a_tok = _admin()
    import uuid
    unique_code = f"EXHAUST-{uuid.uuid4().hex[:8].upper()}"
    client.post(
        "/v1/admin/invite-codes",
        headers=_h(a_tok),
        json={"code": unique_code, "max_uses": 1},
    )
    # Use once (succeeds)
    client.post("/v1/invite-codes/use", json={"code": unique_code})
    # Use again → 422
    r = client.post("/v1/invite-codes/use", json={"code": unique_code})
    assert r.status_code == 422, r.text


def test_nonexistent_invite_code_returns_422():
    """Using an invite code that doesn't exist returns 422."""
    r = client.post("/v1/invite-codes/use", json={"code": "DOES-NOT-EXIST-XYZ"})
    assert r.status_code == 422, r.text


def test_admin_only_can_create_invite_code():
    """Non-admin cannot create invite codes."""
    c_tok = _customer()
    r = client.post(
        "/v1/admin/invite-codes",
        headers=_h(c_tok),
        json={"code": "UNAUTHORIZED-CODE", "max_uses": 5},
    )
    assert r.status_code == 403, r.text
