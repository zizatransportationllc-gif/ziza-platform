"""Sprint 73 — ride payment: authorize the saved card at driver-accept, capture
at completion, void on cancel. Non-fatal when the customer has no card.

Mock mode (no stripe key): get_default_payment_method is patched to simulate a
saved card so the authorize/capture wiring is exercised end-to-end.
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


def _card_customer() -> str:
    c = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c))
    client.post("/v1/payments/methods/setup-intent", headers=_h(c))  # creates the Stripe customer
    return c


def _payable_driver() -> str:
    d = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(d))
    reg = client.post("/v1/drivers/register", headers=_h(d)).json()
    a = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a))
    client.patch(f"/v1/admin/drivers/{reg['driver_id']}/status",
                 headers=_h(a), json={"status": "active"})
    client.post("/v1/payouts/connect/onboard", headers=_h(d))  # mock connected account
    return d


def _book(c: str) -> str:
    est = client.post("/v1/estimate", headers=_h(c), json={
        "origin_lat": 5.32, "origin_lng": -4.01, "dest_lat": 5.36, "dest_lng": -3.98,
    }).json()["estimate_id"]
    return client.post("/v1/trips", headers=_h(c),
                       json={"estimate_id": est, "category": "economy"}).json()["trip_id"]


def _has_card(monkeypatch, pm: str | None = "pm_test_123"):
    from app.payment import stripe_cards
    monkeypatch.setattr(stripe_cards, "get_default_payment_method", lambda _cid: pm)


def test_ride_authorized_at_accept_and_captured_at_complete(monkeypatch):
    _has_card(monkeypatch)
    c, d = _card_customer(), _payable_driver()
    tid = _book(c)

    assert client.patch(f"/v1/trips/{tid}/accept", headers=_h(d)).status_code == 200
    pay = client.get(f"/v1/trips/{tid}/payment", headers=_h(c))
    assert pay.status_code == 200, pay.text
    assert pay.json()["status"] == "authorized"

    client.patch(f"/v1/trips/{tid}/start", headers=_h(d))
    assert client.patch(f"/v1/trips/{tid}/complete", headers=_h(d)).status_code == 200
    assert client.get(f"/v1/trips/{tid}/payment", headers=_h(c)).json()["status"] == "paid"


def test_ride_hold_voided_on_cancel(monkeypatch):
    _has_card(monkeypatch)
    c, d = _card_customer(), _payable_driver()
    tid = _book(c)

    client.patch(f"/v1/trips/{tid}/accept", headers=_h(d))
    assert client.get(f"/v1/trips/{tid}/payment", headers=_h(c)).json()["status"] == "authorized"
    assert client.patch(f"/v1/trips/{tid}/cancel", headers=_h(c)).status_code == 200
    assert client.get(f"/v1/trips/{tid}/payment", headers=_h(c)).json()["status"] == "cancelled"


def test_no_saved_card_does_not_block_accept(monkeypatch):
    _has_card(monkeypatch, pm=None)  # customer has no default card
    c = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c))
    d = _payable_driver()
    tid = _book(c)

    assert client.patch(f"/v1/trips/{tid}/accept", headers=_h(d)).status_code == 200
    # No hold placed → no payment intent for the trip yet.
    assert client.get(f"/v1/trips/{tid}/payment", headers=_h(c)).status_code == 404
