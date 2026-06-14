"""WS7 (Sprint 68) — end-to-end money loop (recette automatisée).

Exercises the whole real-money pipeline against the mock providers, in one flow:
trip payment → refund → wallet top-up → driver withdrawal+payout →
professional earning+withdrawal+payout → reconciliation/metrics/alerts.

This is the automated counterpart of the Stripe test-mode recette
(docs/go-live/2026-06-14-money-sandbox-recette.md).
"""
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


def _webhook(provider_ref: str, status: str = "paid") -> None:
    r = client.post("/v1/payments/webhook", json={"provider_ref": provider_ref, "status": status})
    assert r.status_code == 200, r.text


def test_full_money_loop():
    tc = _tok("customer@ziza.dev")
    td = _tok("driver@ziza.dev")
    tp = _tok("professional@ziza.dev")
    ta = _tok("admin@ziza.dev")
    for t in (tc, td, tp, ta):
        client.post("/v1/auth/register", headers=_h(t))
    client.post("/v1/drivers/register", headers=_h(td))
    client.post("/v1/craft/professionals/register", headers=_h(tp), json={"specialties": "tow"})

    # Both payees onboard for payouts (mock-onboarded).
    assert client.post("/v1/payouts/connect/onboard", headers=_h(td)).status_code == 201
    assert client.post("/v1/payouts/connect/onboard", headers=_h(tp)).status_code == 201

    # 1) Trip → payment → paid
    est = client.post("/v1/estimate", headers=_h(tc), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.36, "dest_lng": -3.98,
    }).json()["estimate_id"]
    tid = client.post("/v1/trips", headers=_h(tc), json={"estimate_id": est}).json()["trip_id"]
    for a in ("accept", "start", "complete"):
        assert client.patch(f"/v1/trips/{tid}/{a}", headers=_h(td)).status_code == 200
    intent = client.post("/v1/payments/intent", headers=_h(tc), json={"trip_id": tid}).json()
    _webhook(intent["provider_ref"], "paid")
    assert client.get(f"/v1/payments/{intent['intent_id']}", headers=_h(tc)).json()["status"] == "paid"

    # 2) Refund that payment (admin)
    rf = client.post(f"/v1/admin/payments/{intent['intent_id']}/refund", headers=_h(ta))
    assert rf.status_code == 200 and rf.json()["status"] == "refunded"

    # 3) Wallet top-up → credited after webhook
    before = client.get("/v1/wallet", headers=_h(tc)).json()["balance_cents"]
    tref = client.post("/v1/wallet/topup", headers=_h(tc), json={"amount_cents": 4000.0}).json()["provider_ref"]
    _webhook(tref, "paid")
    assert client.get("/v1/wallet", headers=_h(tc)).json()["balance_cents"] == before + 4000.0

    # 4) Driver withdrawal → approve → payout batch → processed
    avail_d = client.get("/v1/drivers/me/balance", headers=_h(td)).json()["disponible_cents"]
    assert avail_d > 0
    dpid = client.post("/v1/drivers/me/payout-requests", headers=_h(td),
                       json={"amount_cents": min(avail_d, 100)}).json()["payout_id"]
    client.patch(f"/v1/admin/payout-requests/{dpid}/status", headers=_h(ta), json={"status": "approved"})
    run_d = client.post("/v1/admin/payouts/run", headers=_h(ta)).json()
    assert run_d["processed"] >= 1 and run_d["failed"] == 0

    # 5) Professional earns (accepted bid) → withdrawal → approve → pro payout batch
    rid = client.post("/v1/craft/requests", headers=_h(tc), json={
        "category": "tow", "description": "Flat tyre", "lat": 5.32, "lng": -4.01}).json()["request_id"]
    bid_id = client.post(f"/v1/craft/requests/{rid}/bids", headers=_h(tp), json={
        "price_cents": 30_000, "eta_min": 20}).json()["bid_id"]
    client.post(f"/v1/craft/requests/{rid}/select", headers=_h(tc), json={"bid_id": bid_id})
    ppid = client.post("/v1/craft/professionals/me/payout-requests", headers=_h(tp),
                       json={"amount_cents": 10_000}).json()["payout_id"]
    client.patch(f"/v1/admin/professional-payout-requests/{ppid}/status", headers=_h(ta), json={"status": "approved"})
    run_p = client.post("/v1/admin/professional-payouts/run", headers=_h(ta)).json()
    assert run_p["processed"] >= 1 and run_p["failed"] == 0

    # 6) Reconciliation balanced + metrics reflect the activity
    recon = client.get("/v1/admin/finance/reconciliation", headers=_h(ta)).json()
    assert recon["balanced"] is True
    assert recon["payments"]["refunded_count"] >= 1
    assert recon["payouts"]["driver_processed_total_cents"] >= 1
    assert recon["payouts"]["professional_processed_total_cents"] >= 10_000

    metrics = client.get("/v1/admin/finance/metrics", headers=_h(ta)).json()
    assert metrics["payments"]["refunded"] >= 1
    assert metrics["payouts"]["driver"]["processed"] >= 1
    assert metrics["payouts"]["professional"]["processed"] >= 1

    # No critical ledger-imbalance alert
    alerts = client.get("/v1/admin/finance/alerts", headers=_h(ta)).json()
    assert all(a["code"] != "ledger_imbalance" for a in alerts)
