"""Sprint 15 + Sprint 67 — Driver payout requests (balance-capped).

Scenarios covered:
  POST /v1/drivers/me/payout-requests   — create, validation, balance cap, role/auth guards
  GET  /v1/drivers/me/payout-requests   — list, auth guard
  GET  /v1/admin/payout-requests        — admin list, role guard
  PATCH /v1/admin/payout-requests/{id}/status — approve, reject+note, invalid status, 404

Sprint 67: withdrawals are now capped at the driver's available balance, so each
test that expects a 201 first gives the driver earnings via a completed trip.
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


def _create_completed_trip(customer_tok: str, driver_tok: str, category: str = "economy") -> dict:
    """Create and run a trip to completion so the driver accrues earnings."""
    est = client.post("/v1/estimate", headers=_h(customer_tok), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175,
        "dest_lat": 5.3600, "dest_lng": -3.9801,
    })
    assert est.status_code == 200, est.text
    estimate_id = est.json()["estimate_id"]
    trip = client.post("/v1/trips", headers=_h(customer_tok), json={
        "estimate_id": estimate_id, "category": category,
    })
    assert trip.status_code == 201, trip.text
    trip_id = trip.json()["trip_id"]
    assert client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(driver_tok)).status_code == 200
    assert client.patch(f"/v1/trips/{trip_id}/start", headers=_h(driver_tok)).status_code == 200
    done = client.patch(f"/v1/trips/{trip_id}/complete", headers=_h(driver_tok))
    assert done.status_code == 200, done.text
    return done.json()


def _setup_driver_with_earnings() -> str:
    """Driver with one completed economy trip → positive available balance."""
    d_tok = _setup_driver()
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))
    _create_completed_trip(c_tok, d_tok)
    return d_tok


def _available(tok: str) -> int:
    r = client.get("/v1/drivers/me/balance", headers=_h(tok))
    assert r.status_code == 200, r.text
    return r.json()["disponible_cents"]


def _create_payout(tok: str, amount: int):
    return client.post(
        "/v1/drivers/me/payout-requests",
        headers=_h(tok),
        json={"amount_cents": amount},
    )


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------

def test_driver_create_payout_request():
    """Driver withdraws within balance — 201, shape correct."""
    tok = _setup_driver_with_earnings()
    avail = _available(tok)
    assert avail > 0
    r = _create_payout(tok, avail)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["amount_cents"] == avail
    assert data["status"] == "pending"
    assert data["note_admin"] is None
    assert "payout_id" in data


def test_driver_create_payout_exceeds_balance_returns_422():
    """Sprint 67: requesting more than the available balance is rejected."""
    tok = _setup_driver_with_earnings()
    avail = _available(tok)
    r = _create_payout(tok, avail + 1)
    assert r.status_code == 422, r.text


def test_driver_create_payout_no_earnings_returns_422():
    """A driver with no earnings has zero available balance → 422."""
    tok = _setup_driver()
    r = _create_payout(tok, 100)
    assert r.status_code == 422


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
        json={"amount_cents": 10_000},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Driver list
# ---------------------------------------------------------------------------

def test_driver_list_payout_requests():
    """Driver can list their payout requests; list contains one just created."""
    tok = _setup_driver_with_earnings()
    amount = min(_available(tok), 100)
    _create_payout(tok, amount)
    r = client.get("/v1/drivers/me/payout-requests", headers=_h(tok))
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert amount in [p["amount_cents"] for p in data]


def test_driver_list_payout_requires_auth():
    """Unauthenticated list request returns 401."""
    r = client.get("/v1/drivers/me/payout-requests")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Admin list
# ---------------------------------------------------------------------------

def test_admin_list_payout_requests():
    """Admin sees all payout requests with driver_email in each record."""
    d_tok = _setup_driver_with_earnings()
    _create_payout(d_tok, min(_available(d_tok), 100))

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
    d_tok = _setup_driver_with_earnings()
    a_tok = _setup_admin()

    pr = _create_payout(d_tok, min(_available(d_tok), 100))
    assert pr.status_code == 201, pr.text
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
    d_tok = _setup_driver_with_earnings()
    a_tok = _setup_admin()

    pr = _create_payout(d_tok, min(_available(d_tok), 100))
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
    d_tok = _setup_driver_with_earnings()
    a_tok = _setup_admin()

    pr = _create_payout(d_tok, min(_available(d_tok), 100))
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
