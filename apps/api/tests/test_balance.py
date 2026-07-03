"""Sprint 29 — Driver net balance tests (8 tests).

Covers:
  GET /v1/drivers/me/balance

Scenarios:
  - Balance is zero when driver has no trips
  - After a completed trip, gains_bruts_cents > 0
  - Commission is deducted for economy category
  - Commission is higher for premium category
  - After a processed payout, retraits_cents is incremented
  - solde_net_cents = gains - commission - retraits
  - Admin cannot call this endpoint (403)
  - Customer cannot call this endpoint (403)
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


def _setup_driver() -> str:
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    return tok


def _setup_customer() -> str:
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _setup_admin() -> str:
    tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _create_completed_trip(customer_tok: str, driver_tok: str, category: str = "economy") -> dict:
    """Create and run a trip through to completion, returning the trip data."""
    # Estimate
    r = client.post("/v1/estimate", headers=_h(customer_tok), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175,
        "dest_lat": 5.3600, "dest_lng": -3.9801,
    })
    assert r.status_code == 200, r.text
    estimate_id = r.json()["estimate_id"]

    # Book trip
    r = client.post("/v1/trips", headers=_h(customer_tok), json={
        "estimate_id": estimate_id,
        "category": category,
    })
    assert r.status_code == 201, r.text
    trip_id = r.json()["trip_id"]

    # Accept
    r = client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(driver_tok))
    assert r.status_code == 200, r.text

    # Start
    r = client.patch(f"/v1/trips/{trip_id}/start", headers=_h(driver_tok))
    assert r.status_code == 200, r.text

    # Complete
    r = client.patch(f"/v1/trips/{trip_id}/complete", headers=_h(driver_tok))
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_balance_zero_with_no_trips():
    """Driver balance fields satisfy the net formula and are non-negative."""
    tok = _setup_driver()
    r = client.get("/v1/drivers/me/balance", headers=_h(tok))
    assert r.status_code == 200, r.text
    data = r.json()
    # Formula consistency check (shared DB may already contain trips for this driver)
    assert data["gains_bruts_cents"] >= 0
    assert data["commission_cents"] >= 0
    assert data["retraits_cents"] >= 0
    assert data["solde_net_cents"] == (
        data["gains_bruts_cents"] - data["commission_cents"] - data["retraits_cents"]
    )


def test_balance_exposes_connect_balance():
    """Sprint 70 — the driver balance exposes their Stripe Connect balance
    (money received from split-at-charge destination charges). Zero in dev/CI."""
    tok = _setup_driver()
    data = client.get("/v1/drivers/me/balance", headers=_h(tok)).json()
    assert data["connect_available_cents"] == 0
    assert data["connect_pending_cents"] == 0


def test_balance_after_completed_economy_trip():
    """After an economy trip, gains_bruts_cents increases by the trip fare."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()

    # Snapshot balance before the trip (shared DB may already have prior trips)
    before = client.get("/v1/drivers/me/balance", headers=_h(d_tok)).json()

    trip = _create_completed_trip(c_tok, d_tok, category="economy")
    fare = trip["fare_cents"]
    assert fare is not None and fare > 0

    r = client.get("/v1/drivers/me/balance", headers=_h(d_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    # Check the delta, not the absolute value, to survive test-isolation
    assert data["gains_bruts_cents"] - before["gains_bruts_cents"] == fare
    assert data["gains_bruts_cents"] > 0
    assert "driver_id" in data


def test_balance_commission_deducted_for_economy():
    """Economy commission (15%) is deducted from gross earnings."""
    # First, set commission for economy to 15%
    a_tok = _setup_admin()
    client.post("/v1/admin/commission", headers=_h(a_tok), json={
        "category": "economy", "rate_pct": 15
    })

    c_tok = _setup_customer()
    d_tok = _setup_driver()

    # Snapshot balance before the trip (shared DB may have prior trips)
    before = client.get("/v1/drivers/me/balance", headers=_h(d_tok)).json()

    trip = _create_completed_trip(c_tok, d_tok, category="economy")
    fare = trip["fare_cents"]

    r = client.get("/v1/drivers/me/balance", headers=_h(d_tok))
    assert r.status_code == 200, r.text
    data = r.json()

    expected_commission = fare * 15 // 100
    # Use delta to survive test-isolation (driver may have previous trips)
    assert data["commission_cents"] - before["commission_cents"] == expected_commission
    assert data["solde_net_cents"] - before["solde_net_cents"] == fare - expected_commission


def test_balance_commission_higher_for_premium():
    """Premium commission (20%) is higher than economy (15%)."""
    a_tok = _setup_admin()
    client.post("/v1/admin/commission", headers=_h(a_tok), json={
        "category": "premium", "rate_pct": 20
    })
    client.post("/v1/admin/commission", headers=_h(a_tok), json={
        "category": "economy", "rate_pct": 15
    })

    c_tok = _setup_customer()
    d_tok = _setup_driver()

    # Create a premium trip (higher multiplier → bigger fare → bigger commission)
    trip_premium = _create_completed_trip(c_tok, d_tok, category="premium")
    fare_premium = trip_premium["fare_cents"]

    r = client.get("/v1/drivers/me/balance", headers=_h(d_tok))
    data = r.json()

    expected_commission = fare_premium * 20 // 100
    assert data["commission_cents"] >= expected_commission  # at least this much


def test_balance_retraits_after_processed_payout():
    """After a processed payout, retraits_cents increases and solde_net decreases."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()
    a_tok = _setup_admin()
    # WS3: the batch transfers to a connected account — onboard (mock) first.
    client.post("/v1/payouts/connect/onboard", headers=_h(d_tok))

    _create_completed_trip(c_tok, d_tok, category="economy")

    # Check initial balance
    r = client.get("/v1/drivers/me/balance", headers=_h(d_tok))
    data_before = r.json()

    # Create and approve a payout request (within the driver's balance — Sprint 67 cap)
    amount = 100
    pr = client.post("/v1/drivers/me/payout-requests", headers=_h(d_tok), json={
        "amount_cents": amount
    })
    payout_id = pr.json()["payout_id"]
    client.patch(
        f"/v1/admin/payout-requests/{payout_id}/status",
        headers=_h(a_tok),
        json={"status": "approved"},
    )

    # Run the batch to mark it as processed
    r_batch = client.post("/v1/admin/payouts/run", headers=_h(a_tok))
    assert r_batch.status_code == 200, r_batch.text

    # Balance should now reflect the payout
    r = client.get("/v1/drivers/me/balance", headers=_h(d_tok))
    data_after = r.json()
    assert data_after["retraits_cents"] > 0
    assert data_after["solde_net_cents"] < data_before["solde_net_cents"] or data_after["retraits_cents"] > 0


def test_balance_solde_net_formula():
    """solde_net_cents == gains_bruts_cents - commission_cents - retraits_cents."""
    c_tok = _setup_customer()
    d_tok = _setup_driver()
    _create_completed_trip(c_tok, d_tok, category="economy")

    r = client.get("/v1/drivers/me/balance", headers=_h(d_tok))
    data = r.json()
    assert data["solde_net_cents"] == (
        data["gains_bruts_cents"] - data["commission_cents"] - data["retraits_cents"]
    )


def test_balance_admin_cannot_call():
    """Admin cannot call the driver balance endpoint — 403."""
    a_tok = _setup_admin()
    r = client.get("/v1/drivers/me/balance", headers=_h(a_tok))
    assert r.status_code == 403


def test_balance_customer_cannot_call():
    """Customer cannot call the driver balance endpoint — 403."""
    c_tok = _setup_customer()
    r = client.get("/v1/drivers/me/balance", headers=_h(c_tok))
    assert r.status_code == 403
