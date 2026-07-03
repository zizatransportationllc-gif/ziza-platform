"""Sprint 70 — internal self-service withdrawals are disabled by default.

With the split done at charge time (Connect destination charges), a payee's
share is already in their Stripe balance, so creating an internal payout request
would double-pay. When ``settings.internal_withdrawals_enabled`` is False the
self-service endpoints return 409 for both drivers and professionals.

NB: the autouse conftest fixture enables the flow for the rest of the suite; here
we explicitly disable it to assert the production default behaviour.
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


def test_driver_withdrawal_blocked_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "internal_withdrawals_enabled", False)
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    r = client.post("/v1/drivers/me/payout-requests", headers=_h(tok), json={"amount_cents": 100})
    assert r.status_code == 409, r.text


def test_pro_withdrawal_blocked_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "internal_withdrawals_enabled", False)
    tok = _tok("professional@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/craft/professionals/register", headers=_h(tok), json={"specialties": "tow"})
    r = client.post(
        "/v1/craft/professionals/me/payout-requests", headers=_h(tok), json={"amount_cents": 100}
    )
    assert r.status_code == 409, r.text


def test_withdrawal_allowed_when_enabled():
    # The autouse conftest fixture enables the flow; a driver with no balance
    # gets 422 (amount exceeds balance), NOT 409 — proving the flow is reachable.
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    r = client.post("/v1/drivers/me/payout-requests", headers=_h(tok), json={"amount_cents": 100})
    assert r.status_code == 422, r.text
