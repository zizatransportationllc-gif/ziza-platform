"""WS4 (Sprint 68) — refunds + financial reconciliation."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _paid_intent() -> tuple[str, str]:
    """Create a completed+paid trip; return (intent_id, customer_token)."""
    tc = _tok("customer@ziza.dev")
    td = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tc))
    client.post("/v1/auth/register", headers=_h(td))
    client.post("/v1/drivers/register", headers=_h(td))
    est = client.post("/v1/estimate", headers=_h(tc), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.36, "dest_lng": -3.98,
    }).json()["estimate_id"]
    tid = client.post("/v1/trips", headers=_h(tc), json={"estimate_id": est}).json()["trip_id"]
    for a in ("accept", "start", "complete"):
        client.patch(f"/v1/trips/{tid}/{a}", headers=_h(td))
    intent = client.post("/v1/payments/intent", headers=_h(tc), json={"trip_id": tid}).json()
    client.post("/v1/payments/webhook", json={"provider_ref": intent["provider_ref"], "status": "paid"})
    return intent["intent_id"], tc


# ---------------------------------------------------------------------------
# Refunds
# ---------------------------------------------------------------------------

def test_admin_refund_paid_payment():
    intent_id, _ = _paid_intent()
    a_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a_tok))

    r = client.post(f"/v1/admin/payments/{intent_id}/refund", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "refunded"


def test_refund_is_idempotent():
    intent_id, _ = _paid_intent()
    a_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a_tok))
    client.post(f"/v1/admin/payments/{intent_id}/refund", headers=_h(a_tok))
    # second refund → still refunded, no error
    again = client.post(f"/v1/admin/payments/{intent_id}/refund", headers=_h(a_tok))
    assert again.status_code == 200
    assert again.json()["status"] == "refunded"


def test_refund_unpaid_intent_returns_422():
    # Create an intent but do NOT pay it.
    tc = _tok("customer@ziza.dev")
    td = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tc))
    client.post("/v1/auth/register", headers=_h(td))
    client.post("/v1/drivers/register", headers=_h(td))
    est = client.post("/v1/estimate", headers=_h(tc), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.36, "dest_lng": -3.98,
    }).json()["estimate_id"]
    tid = client.post("/v1/trips", headers=_h(tc), json={"estimate_id": est}).json()["trip_id"]
    for a in ("accept", "start", "complete"):
        client.patch(f"/v1/trips/{tid}/{a}", headers=_h(td))
    intent_id = client.post("/v1/payments/intent", headers=_h(tc), json={"trip_id": tid}).json()["intent_id"]

    a_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a_tok))
    r = client.post(f"/v1/admin/payments/{intent_id}/refund", headers=_h(a_tok))
    assert r.status_code == 422


def test_refund_requires_admin():
    intent_id, tc = _paid_intent()
    r = client.post(f"/v1/admin/payments/{intent_id}/refund", headers=_h(tc))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------

def test_reconciliation_balanced_and_totals():
    intent_id, tc = _paid_intent()
    # Fund a wallet (top-up + webhook) to populate the ledger.
    ref = client.post("/v1/wallet/topup", headers=_h(tc), json={"amount_cents": 3000.0}).json()["provider_ref"]
    client.post("/v1/payments/webhook", json={"provider_ref": ref, "status": "paid"})

    a_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a_tok))
    r = client.get("/v1/admin/finance/reconciliation", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["balanced"] is True
    assert data["payments"]["paid_total_cents"] > 0
    assert data["topups"]["paid_total_cents"] >= 3000
    assert data["wallets"]["ledger_mismatches"] == []


def test_reconciliation_requires_admin():
    tc = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tc))
    assert client.get("/v1/admin/finance/reconciliation", headers=_h(tc)).status_code == 403
