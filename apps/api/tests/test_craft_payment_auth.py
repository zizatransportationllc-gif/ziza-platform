"""Craft payment: no hold at bid selection — the customer's saved card is charged
in one step when the professional marks the work done (charge-at-completion).

Mock mode (no stripe key): the charge wiring runs end-to-end without Stripe.
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
    t = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(t))
    client.post("/v1/payments/methods/setup-intent", headers=_h(t))  # creates the Stripe customer
    return t


def _payable_pro() -> str:
    t = _tok("professional@ziza.dev")
    client.post("/v1/auth/register", headers=_h(t))
    client.post("/v1/craft/professionals/register", headers=_h(t), json={"specialties": "tow"})
    client.post("/v1/payouts/connect/onboard", headers=_h(t))  # mock connected account
    return t


def _request_with_bid(tc: str, tp: str):
    rid = client.post("/v1/craft/requests", headers=_h(tc), json={
        "category": "breakdown", "description": "Car won't start",
        "lat": 40.7357, "lng": -74.1724, "address": "Newark, NJ",
    }).json()["request_id"]
    bid_id = client.post(f"/v1/craft/requests/{rid}/bids", headers=_h(tp), json={
        "price_cents": 8000, "note": "omw",
        "professional_lat": 40.72, "professional_lng": -74.05,
    }).json()["bid_id"]
    return rid, bid_id


def test_craft_pending_at_select_and_charged_at_work_done(monkeypatch):
    from app.payment import stripe_cards
    monkeypatch.setattr(stripe_cards, "get_default_payment_method", lambda _cid: "pm_test")

    tc, tp = _card_customer(), _payable_pro()
    rid, bid_id = _request_with_bid(tc, tp)

    sel = client.post(f"/v1/craft/requests/{rid}/select", headers=_h(tc), json={"bid_id": bid_id})
    assert sel.status_code == 200, sel.text
    # No hold placed at selection — the amount is just locked as pending.
    pay = client.get(f"/v1/craft/requests/{rid}/payment", headers=_h(tc))
    assert pay.status_code == 200 and pay.json() and pay.json()["status"] == "pending", pay.text

    client.patch(f"/v1/craft/requests/{rid}/arrived", headers=_h(tp))
    client.patch(f"/v1/craft/requests/{rid}/confirm-arrival", headers=_h(tc))
    assert client.patch(f"/v1/craft/requests/{rid}/work-done", headers=_h(tp)).status_code == 200
    pay2 = client.get(f"/v1/craft/requests/{rid}/payment", headers=_h(tc))
    assert pay2.json()["status"] == "paid"


def test_craft_charge_failure_at_completion_marks_failed(monkeypatch):
    """If the card is declined at completion, the intent is marked failed (the pro
    already did the work — surfaced for follow-up, not silently paid)."""
    from app.payment import stripe_cards
    monkeypatch.setattr(stripe_cards, "get_default_payment_method", lambda _cid: "pm_test")
    monkeypatch.setattr(
        stripe_cards, "charge_saved_card",
        lambda *a, **k: {"id": "pi_x", "status": "failed", "decline_code": "card_declined"},
    )

    tc, tp = _card_customer(), _payable_pro()
    rid, bid_id = _request_with_bid(tc, tp)
    client.post(f"/v1/craft/requests/{rid}/select", headers=_h(tc), json={"bid_id": bid_id})
    client.patch(f"/v1/craft/requests/{rid}/arrived", headers=_h(tp))
    client.patch(f"/v1/craft/requests/{rid}/confirm-arrival", headers=_h(tc))
    assert client.patch(f"/v1/craft/requests/{rid}/work-done", headers=_h(tp)).status_code == 200

    pay = client.get(f"/v1/craft/requests/{rid}/payment", headers=_h(tc))
    assert pay.json()["status"] == "failed"


def test_selecting_bid_requires_card_when_stripe_live(monkeypatch):
    from app.payment import stripe_cards

    tc = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tc))
    tp = _tok("professional@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tp))
    client.post("/v1/craft/professionals/register", headers=_h(tp), json={"specialties": "tow"})
    rid, bid_id = _request_with_bid(tc, tp)

    monkeypatch.setattr(stripe_cards, "_enabled", lambda: True)
    monkeypatch.setattr(stripe_cards, "get_default_payment_method", lambda _cid: None)
    r = client.post(f"/v1/craft/requests/{rid}/select", headers=_h(tc), json={"bid_id": bid_id})
    assert r.status_code == 402, r.text
