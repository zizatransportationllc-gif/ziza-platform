"""Sprint 31 — Admin role management tests (5 tests).

Covers:
  PATCH /v1/admin/users/{user_id}/role

Scenarios:
  - Admin changes a user's role successfully
  - Admin cannot promote themselves → 403
  - Invalid role value → 422
  - Non-admin gets 403
  - Nonexistent user → 404
"""
import uuid
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


def _me(token: str) -> dict:
    r = client.get("/v1/me", headers=_h(token))
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_admin_can_change_user_role():
    """Admin can change a customer's role to driver."""
    a_tok = _admin()
    c_tok = _customer()
    customer = _me(c_tok)
    customer_id = customer["id"]

    r = client.patch(
        f"/v1/admin/users/{customer_id}/role",
        headers=_h(a_tok),
        json={"role": "driver"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["role"] == "driver"
    assert data["user_id"] == customer_id


def test_admin_cannot_change_own_role():
    """Admin cannot change their own role → 403."""
    a_tok = _admin()
    admin_user = _me(a_tok)
    admin_id = admin_user["id"]

    r = client.patch(
        f"/v1/admin/users/{admin_id}/role",
        headers=_h(a_tok),
        json={"role": "customer"},
    )
    assert r.status_code == 403, r.text


def test_invalid_role_returns_422():
    """Providing an invalid role value returns 422."""
    a_tok = _admin()
    c_tok = _customer()
    customer_id = _me(c_tok)["id"]

    r = client.patch(
        f"/v1/admin/users/{customer_id}/role",
        headers=_h(a_tok),
        json={"role": "superuser"},  # not a valid role
    )
    assert r.status_code == 422, r.text


def test_non_admin_cannot_change_role():
    """Non-admin gets 403."""
    c_tok = _customer()
    customer_id = _me(c_tok)["id"]

    r = client.patch(
        f"/v1/admin/users/{customer_id}/role",
        headers=_h(c_tok),
        json={"role": "admin"},
    )
    assert r.status_code == 403, r.text


def test_nonexistent_user_returns_404():
    """Changing role for a nonexistent user returns 404."""
    a_tok = _admin()
    fake_id = str(uuid.uuid4())

    r = client.patch(
        f"/v1/admin/users/{fake_id}/role",
        headers=_h(a_tok),
        json={"role": "driver"},
    )
    assert r.status_code == 404, r.text
