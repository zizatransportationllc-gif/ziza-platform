"""WS6 (Sprint 68) — finance observability: metrics, transactions feed, alerts."""
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


def _admin() -> str:
    a = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a))
    return a


def _paid_trip_and_topup() -> None:
    tc = _tok("customer@ziza.dev")
    td = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tc))
    client.post("/v1/auth/register", headers=_h(td))
    client.post("/v1/drivers/register", headers=_h(td))
    client.post("/v1/payouts/connect/onboard", headers=_h(td))  # Sprint 70: Connect for destination charge
    est = client.post("/v1/estimate", headers=_h(tc), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.36, "dest_lng": -3.98,
    }).json()["estimate_id"]
    tid = client.post("/v1/trips", headers=_h(tc), json={"estimate_id": est}).json()["trip_id"]
    for a in ("accept", "start", "complete"):
        client.patch(f"/v1/trips/{tid}/{a}", headers=_h(td))
    ref = client.post("/v1/payments/intent", headers=_h(tc), json={"trip_id": tid}).json()["provider_ref"]
    client.post("/v1/payments/webhook", json={"provider_ref": ref, "status": "paid"})
    tref = client.post("/v1/wallet/topup", headers=_h(tc), json={"amount_cents": 2500.0}).json()["provider_ref"]
    client.post("/v1/payments/webhook", json={"provider_ref": tref, "status": "paid"})


def test_metrics_shape_and_totals():
    _paid_trip_and_topup()
    a = _admin()
    r = client.get("/v1/admin/finance/metrics", headers=_h(a))
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["payments"]["paid"] >= 1
    assert "success_rate" in m["payments"]
    assert "driver" in m["payouts"] and "professional" in m["payouts"]
    assert m["topups"]["paid"] >= 1


def test_transactions_feed():
    _paid_trip_and_topup()
    a = _admin()
    r = client.get("/v1/admin/finance/transactions?limit=10", headers=_h(a))
    assert r.status_code == 200
    feed = r.json()
    assert isinstance(feed, list) and len(feed) >= 2
    kinds = {x["kind"] for x in feed}
    assert "payment" in kinds
    assert "wallet_topup" in kinds


def test_alerts_flags_failed_payout():
    # A driver payout without Connect onboarding fails → alert.
    # NB: intentionally do NOT onboard the driver here — the payout batch must
    # fail (no connected account) so the "failed_payouts" alert is raised.
    td = _tok("driver@ziza.dev")
    tc = _tok("customer@ziza.dev")
    a = _admin()
    client.post("/v1/auth/register", headers=_h(td))
    client.post("/v1/auth/register", headers=_h(tc))
    client.post("/v1/drivers/register", headers=_h(td))
    est = client.post("/v1/estimate", headers=_h(tc), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.36, "dest_lng": -3.98,
    }).json()["estimate_id"]
    tid = client.post("/v1/trips", headers=_h(tc), json={"estimate_id": est}).json()["trip_id"]
    for act in ("accept", "start", "complete"):
        client.patch(f"/v1/trips/{tid}/{act}", headers=_h(td))
    avail = client.get("/v1/drivers/me/balance", headers=_h(td)).json()["disponible_cents"]
    pid = client.post("/v1/drivers/me/payout-requests", headers=_h(td),
                      json={"amount_cents": min(avail, 100)}).json()["payout_id"]
    client.patch(f"/v1/admin/payout-requests/{pid}/status", headers=_h(a), json={"status": "approved"})
    client.post("/v1/admin/payouts/run", headers=_h(a))  # fails (no connected account)

    r = client.get("/v1/admin/finance/alerts", headers=_h(a))
    assert r.status_code == 200
    codes = {x["code"] for x in r.json()}
    assert "failed_payouts" in codes


def test_finance_endpoints_require_admin():
    c = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c))
    assert client.get("/v1/admin/finance/metrics", headers=_h(c)).status_code == 403
    assert client.get("/v1/admin/finance/transactions", headers=_h(c)).status_code == 403
    assert client.get("/v1/admin/finance/alerts", headers=_h(c)).status_code == 403
