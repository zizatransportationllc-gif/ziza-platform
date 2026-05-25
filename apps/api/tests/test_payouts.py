"""Sprint 15 — Driver payout requests (12 tests).

Scenarios covered:
  POST /v1/drivers/me/payout-requests   — create, validation, role guard, auth guard
  GET  /v1/drivers/me/payout-requests   — list, auth guard
  GET  /v1/admin/payout-requests        — admin list, role guard
  PATCH /v1/admin/payout-requests/{id}/status — approve, reject+note, invalid status, 404
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


def _setup_driver(email: str = "driver@ziza.dev") -> str:
    tok = _tok(email)
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    return tok


def _setup_admin(email: str = "admin@ziza.dev") -> str:
    tok = _tok(email)
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _create_payout(tok: str, amount: int = 50_000):
    return client.post(
        "/v1/drivers/me/payout-requests",
        headers=_h(tok),
        json={"amount_xof": amount},
    )


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------

def test_driver_create_payout_request():
    """Driver creates a payout request — 201, shape correct."""
    tok = _setup_driver()
    r = _create_payout(tok, 50_000)
    assert r.status_code == 201
    data = r.json()
    assert data["amount_xof"] == 50_000
    assert data["status"] == "pending"
    assert data["note_admin"] is None
    assert "payout_id" in data


def test_driver_create_payout_zero_amount_returns_422():
    """Amount must be >= 1 — 0 is rejected by Pydantic."""
    tok = _setup_driver()
    r = _create_payout(tok, 0)
    assert r.status_code == 422


def test_driver_create_payout_negative_returns_422():
    """Negative amount is rejected by Pydantic."""
    tok = _setup_driver()
    r = _create_payout(tok, -500)
    assert r.status_code == 422


def test_driver_create_payout_requires_driver_role():
    """A customer cannot create payout requests — 403."""
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    r = _create_payout(tok, 10_000)
    assert r.status_code == 403


def test_driver_create_payout_requires_auth():
    """Unauthenticated request returns 401."""
    r = client.post(
        "/v1/drivers/me/payout-requests",
        json={"amount_xof": 10_000},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Driver list
# ---------------------------------------------------------------------------

def test_driver_list_payout_requests():
    """Driver can list their payout requests; list contains one just created."""
    tok = _setup_driver()
    _create_payout(tok, 25_000)
    r = client.get("/v1/drivers/me/payout-requests", headers=_h(tok))
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    amounts = [p["amount_xof"] for p in data]
    assert 25_000 in amounts


def test_driver_list_payout_requires_auth():
    """Unauthenticated list request returns 401."""
    r = client.get("/v1/drivers/me/payout-requests")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Admin list
# ---------------------------------------------------------------------------

def test_admin_list_payout_requests():
    """Admin sees all payout requests with driver_email in each record."""
    d_tok = _setup_driver()
    _create_payout(d_tok, 15_000)

    a_tok = _setup_admin()
    r = client.get("/v1/admin/payout-requests", headers=_h(a_tok))
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "driver_email" in data[0]
    assert "payout_id" in data[0]


def test_admin_list_payout_requires_admin():
    """Non-admin (customer) is forbidden from the admin list."""
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    r = client.get("/v1/admin/payout-requests", headers=_h(tok))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Admin status update
# ---------------------------------------------------------------------------

def test_admin_approve_payout():
    """Admin approves a payout — status becomes 'approved'."""
    d_tok = _setup_driver()
    a_tok = _setup_admin()

    pr = _create_payout(d_tok, 75_000)
    assert pr.status_code == 201
    payout_id = pr.json()["payout_id"]

    r = client.patch(
        f"/v1/admin/payout-requests/{payout_id}/status",
        headers=_h(a_tok),
        json={"status": "approved"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "approved"
    assert data["payout_id"] == payout_id


def test_admin_reject_payout_with_note():
    """Admin rejects a payout with a reason note."""
    d_tok = _setup_driver()
    a_tok = _setup_admin()

    pr = _create_payout(d_tok, 10_000)
    payout_id = pr.json()["payout_id"]

    r = client.patch(
        f"/v1/admin/payout-requests/{payout_id}/status",
        headers=_h(a_tok),
        json={"status": "rejected", "note_admin": "Documents manquants"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "rejected"
    assert data["note_admin"] == "Documents manquants"


def test_admin_payout_invalid_status_returns_422():
    """'pending' is not a valid target status — Pydantic returns 422."""
    d_tok = _setup_driver()
    a_tok = _setup_admin()

    pr = _create_payout(d_tok, 5_000)
    payout_id = pr.json()["payout_id"]

    r = client.patch(
        f"/v1/admin/payout-requests/{payout_id}/status",
        headers=_h(a_tok),
        json={"status": "pending"},
    )
    assert r.status_code == 422


def test_admin_payout_not_found_returns_404():
    """Non-existent payout ID returns 404."""
    a_tok = _setup_admin()
    r = client.patch(
        f"/v1/admin/payout-requests/{uuid.uuid4()}/status",
        headers=_h(a_tok),
        json={"status": "approved"},
    )
    assert r.status_code == 404
