"""Sprint 24 — Admin stats payment extension (2 tests).

Verifies that GET /v1/admin/stats correctly reflects payment data:
  - payments.total_paid increments after webhook confirms a payment
  - payments.total_paid_cents sums confirmed payment amounts
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_token(email: str = "admin@ziza.dev") -> str:
    resp = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _admin_header() -> dict:
    return {"Authorization": f"Bearer {_get_token('admin@ziza.dev')}"}


def _completed_trip_with_payment() -> tuple[str, str]:
    """Create a completed trip, pay it, return (trip_id, provider_ref)."""
    token_c = _get_token("customer@ziza.dev")
    token_d = _get_token("driver@ziza.dev")

    for token in (token_c, token_d):
        client.post(
            "/v1/auth/register",
            headers={"Authorization": f"Bearer {token}"},
        )
    client.post("/v1/drivers/register", headers={"Authorization": f"Bearer {token_d}"})

    est_resp = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.32, "origin_lng": -4.01, "dest_lat": 5.36, "dest_lng": -3.98},
        headers={"Authorization": f"Bearer {token_c}"},
    )
    estimate_id = est_resp.json()["estimate_id"]

    trip_resp = client.post(
        "/v1/trips",
        json={"estimate_id": estimate_id},
        headers={"Authorization": f"Bearer {token_c}"},
    )
    trip_id = trip_resp.json()["trip_id"]

    for action in ("accept", "start", "complete"):
        client.patch(
            f"/v1/trips/{trip_id}/{action}",
            headers={"Authorization": f"Bearer {token_d}"},
        )

    intent_resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": trip_id},
        headers={"Authorization": f"Bearer {token_c}"},
    )
    provider_ref = intent_resp.json()["provider_ref"]
    fare_cents = intent_resp.json()["amount_cents"]

    # Confirm via webhook
    client.post(
        "/v1/payments/webhook",
        json={"provider_ref": provider_ref, "status": "paid"},
    )

    return trip_id, fare_cents


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_admin_stats_includes_payments_section() -> None:
    """GET /v1/admin/stats must include a 'payments' key."""
    resp = client.get("/v1/admin/stats", headers=_admin_header())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "payments" in body
    assert "total_paid" in body["payments"]
    assert "total_paid_cents" in body["payments"]


def test_admin_stats_payments_totals_after_paid_webhook() -> None:
    """After a payment is confirmed, stats.payments.total_paid increments."""
    # Baseline
    before = client.get("/v1/admin/stats", headers=_admin_header()).json()
    paid_before = before["payments"]["total_paid"]
    xof_before = before["payments"]["total_paid_cents"]

    _trip_id, fare_cents = _completed_trip_with_payment()

    after = client.get("/v1/admin/stats", headers=_admin_header()).json()
    assert after["payments"]["total_paid"] == paid_before + 1
    assert after["payments"]["total_paid_cents"] == xof_before + fare_cents
