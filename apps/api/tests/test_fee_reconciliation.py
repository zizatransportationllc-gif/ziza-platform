"""Sprint 70 — Stripe fee reconciliation (estimated vs actual).

The admin endpoint fetches the provider's real fee for each paid split payment
and reports the drift. With the mock provider (dev/CI) the actual fee is unknown
and treated as no drift, so the report is within tolerance.
"""
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": settings.auth_dev_password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _paid_ride() -> None:
    tc = _tok("customer@ziza.dev")
    td = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tc))
    client.post("/v1/auth/register", headers=_h(td))
    client.post("/v1/drivers/register", headers=_h(td))
    client.post("/v1/payouts/connect/onboard", headers=_h(td))
    est = client.post("/v1/estimate", headers=_h(tc), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.36, "dest_lng": -3.98,
    }).json()["estimate_id"]
    tid = client.post("/v1/trips", headers=_h(tc), json={"estimate_id": est}).json()["trip_id"]
    for a in ("accept", "start", "complete"):
        client.patch(f"/v1/trips/{tid}/{a}", headers=_h(td))
    intent = client.post("/v1/payments/intent", headers=_h(tc), json={"trip_id": tid}).json()
    client.post("/v1/payments/webhook", json={"provider_ref": intent["provider_ref"], "status": "paid"})


def test_fee_reconciliation_balanced_in_mock():
    _paid_ride()
    a = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a))
    r = client.get("/v1/admin/finance/fee-reconciliation", headers=_h(a))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["intents_checked"] >= 1
    assert data["estimated_fee_total_cents"] > 0
    # Mock provider → actual assumed equal to estimate → zero drift.
    assert data["actual_fee_total_cents"] == data["estimated_fee_total_cents"]
    assert data["drift_total_cents"] == 0
    assert data["within_tolerance"] is True
    assert data["discrepancies"] == []


def test_fee_reconciliation_requires_admin():
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    r = client.get("/v1/admin/finance/fee-reconciliation", headers=_h(tok))
    assert r.status_code == 403
