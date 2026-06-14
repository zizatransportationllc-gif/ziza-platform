"""End-to-end driver payout via Wells Fargo (ACH), using the bank account."""
import json
import urllib.request

import pytest
from fastapi.testclient import TestClient

import app.config as _config
from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    return client.post("/v1/token", json={"email": email, "password": "ziza2024"}).json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


class _FakeResp:
    def __init__(self, body):
        self._b = body

    def read(self):
        return self._b

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_driver_payout_via_wellsfargo_bank_account(monkeypatch):
    # Route payouts through Wells Fargo and stub the gateway HTTP call.
    monkeypatch.setattr(_config.settings, "payout_provider", "wellsfargo", raising=False)
    captured = {}

    def _fake_urlopen(req):
        captured["body"] = json.loads(req.data.decode())
        return _FakeResp(json.dumps({"paymentId": "wf_pay_e2e"}).encode())

    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)

    td = _tok("driver@ziza.dev")
    tc = _tok("customer@ziza.dev")
    ta = _tok("admin@ziza.dev")
    for t in (td, tc, ta):
        client.post("/v1/auth/register", headers=_h(t))
    client.post("/v1/drivers/register", headers=_h(td))

    # Driver provides a bank account (the WF payout destination).
    client.put("/v1/profile/bank-account", headers=_h(td), json={
        "account_holder_name": "Dee Driver",
        "routing_number": "021000021",
        "account_number": "555566667777",
    })

    # Earnings via a completed trip.
    est = client.post("/v1/estimate", headers=_h(tc), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.36, "dest_lng": -3.98,
    }).json()["estimate_id"]
    tid = client.post("/v1/trips", headers=_h(tc), json={"estimate_id": est}).json()["trip_id"]
    for a in ("accept", "start", "complete"):
        client.patch(f"/v1/trips/{tid}/{a}", headers=_h(td))

    avail = client.get("/v1/drivers/me/balance", headers=_h(td)).json()["disponible_cents"]
    pid = client.post("/v1/drivers/me/payout-requests", headers=_h(td),
                      json={"amount_cents": min(avail, 100)}).json()["payout_id"]
    client.patch(f"/v1/admin/payout-requests/{pid}/status", headers=_h(ta), json={"status": "approved"})

    run = client.post("/v1/admin/payouts/run", headers=_h(ta)).json()
    assert run["processed"] >= 1 and run["failed"] == 0
    # The WF gateway received the driver's (decrypted) bank account.
    assert captured["body"]["destination"]["routingNumber"] == "021000021"
    assert captured["body"]["destination"]["accountNumber"] == "555566667777"
