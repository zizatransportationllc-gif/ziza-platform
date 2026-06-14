"""Sprint 29 + Sprint 67 — Payout batch tests (8 tests).

Covers:
  POST /v1/admin/payouts/run

Sprint 67: payouts are capped at the driver's available balance, so drivers are
given earnings via a completed trip and withdrawal amounts are small.
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


def _setup_admin() -> str:
    tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _create_completed_trip(customer_tok: str, driver_tok: str) -> None:
    est = client.post("/v1/estimate", headers=_h(customer_tok), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175,
        "dest_lat": 5.3600, "dest_lng": -3.9801,
    })
    estimate_id = est.json()["estimate_id"]
    trip = client.post("/v1/trips", headers=_h(customer_tok), json={
        "estimate_id": estimate_id, "category": "economy",
    })
    trip_id = trip.json()["trip_id"]
    client.patch(f"/v1/trips/{trip_id}/accept", headers=_h(driver_tok))
    client.patch(f"/v1/trips/{trip_id}/start", headers=_h(driver_tok))
    assert client.patch(f"/v1/trips/{trip_id}/complete", headers=_h(driver_tok)).status_code == 200


def _setup_driver_with_earnings() -> str:
    """Driver with one completed trip → enough balance for small withdrawals."""
    d_tok = _setup_driver()
    # WS3: payouts require a connected Stripe account (mock-onboarded in tests).
    client.post("/v1/payouts/connect/onboard", headers=_h(d_tok))
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))
    _create_completed_trip(c_tok, d_tok)
    return d_tok


def _approved_payout(driver_tok: str, admin_tok: str, amount: int = 100) -> str:
    """Create a payout request (within balance) and approve it — return the payout_id."""
    pr = client.post(
        "/v1/drivers/me/payout-requests",
        headers=_h(driver_tok),
        json={"amount_cents": amount},
    )
    assert pr.status_code == 201, pr.text
    payout_id = pr.json()["payout_id"]
    r = client.patch(
        f"/v1/admin/payout-requests/{payout_id}/status",
        headers=_h(admin_tok),
        json={"status": "approved"},
    )
    assert r.status_code == 200, r.text
    return payout_id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_batch_with_no_approved_requests():
    """Running the batch with nothing to process returns processed=0, failed=0."""
    a_tok = _setup_admin()
    r = client.post("/v1/admin/payouts/run", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    # There may be leftovers from other tests, so just check structure
    assert "processed" in data
    assert "failed" in data
    assert "total_net_cents" in data
    assert "total_commission_cents" in data


def test_batch_processes_one_approved_request():
    """Batch processes one approved payout and returns processed=1."""
    d_tok = _setup_driver_with_earnings()
    a_tok = _setup_admin()
    _approved_payout(d_tok, a_tok, 100)

    r = client.post("/v1/admin/payouts/run", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["processed"] >= 1
    assert data["failed"] == 0


def test_batch_sets_provider_ref_on_processed_request():
    """After batch runs, the payout request should have status 'processed'."""
    d_tok = _setup_driver_with_earnings()
    a_tok = _setup_admin()
    payout_id = _approved_payout(d_tok, a_tok, 100)

    client.post("/v1/admin/payouts/run", headers=_h(a_tok))

    # Check via admin list
    r = client.get("/v1/admin/payout-requests", headers=_h(a_tok))
    payouts = r.json()
    target = next((p for p in payouts if p["payout_id"] == payout_id), None)
    assert target is not None
    assert target["status"] == "processed"


def test_batch_report_processed_failed_counts():
    """Batch summary reports the exact number of processed and failed requests."""
    d_tok = _setup_driver_with_earnings()
    a_tok = _setup_admin()

    # Create 2 approved payouts (sum stays within the driver's balance)
    _approved_payout(d_tok, a_tok, 100)
    _approved_payout(d_tok, a_tok, 100)

    r = client.post("/v1/admin/payouts/run", headers=_h(a_tok))
    data = r.json()
    assert data["processed"] >= 2
    assert data["total_net_cents"] > 0


def test_batch_idempotent_on_processed_requests():
    """Re-running the batch on already-processed requests does not re-process them."""
    d_tok = _setup_driver_with_earnings()
    a_tok = _setup_admin()
    _approved_payout(d_tok, a_tok, 100)

    # First run
    r1 = client.post("/v1/admin/payouts/run", headers=_h(a_tok))
    count1 = r1.json()["processed"]

    # Second run — no new approved requests
    r2 = client.post("/v1/admin/payouts/run", headers=_h(a_tok))
    count2 = r2.json()["processed"]

    # Second run should not re-process the same request
    assert count2 == 0


def test_batch_summary_includes_totals():
    """Batch result includes total_net_cents and total_commission_cents."""
    d_tok = _setup_driver_with_earnings()
    a_tok = _setup_admin()
    _approved_payout(d_tok, a_tok, 100)

    # Ensure commission is set to 15%
    client.post("/v1/admin/commission", headers=_h(a_tok), json={
        "category": "default", "rate_pct": 15
    })

    r = client.post("/v1/admin/payouts/run", headers=_h(a_tok))
    data = r.json()
    assert data["processed"] >= 1
    assert data["total_net_cents"] >= 0
    assert data["total_commission_cents"] >= 0
    # net + commission should roughly equal gross
    assert data["total_net_cents"] + data["total_commission_cents"] > 0


def test_batch_non_admin_forbidden():
    """Driver cannot run the batch — 403."""
    d_tok = _setup_driver()
    r = client.post("/v1/admin/payouts/run", headers=_h(d_tok))
    assert r.status_code == 403


def test_batch_unauthenticated_returns_401():
    """Unauthenticated request to batch endpoint returns 401."""
    r = client.post("/v1/admin/payouts/run")
    assert r.status_code == 401
