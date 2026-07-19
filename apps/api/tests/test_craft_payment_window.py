"""Craft payment window — the customer validates a Stripe hold before selecting.

Flow: POST .../bids/{bid}/payment-intent (creates the hold, returns a
client_secret the app confirms in Stripe's UI) → select → the hold reconciles
to 'authorized' → capture at completion charges it.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _customer() -> str:
    t = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(t))
    # A saved card / Stripe customer is required to create the hold.
    client.post("/v1/payments/methods/setup-intent", headers=_h(t))
    return t


def _professional() -> str:
    t = _tok("professional@ziza.dev")
    client.post("/v1/auth/register", headers=_h(t))
    client.post("/v1/craft/professionals/register", headers=_h(t),
                json={"specialties": "breakdown,tow", "bio": "Test pro"})
    # Onboard to Connect so a destination account exists for the split.
    client.post("/v1/payouts/connect/onboard", headers=_h(t))
    return t


def _open_request_with_bid():
    tc, tp = _customer(), _professional()
    rid = client.post("/v1/craft/requests", headers=_h(tc), json={
        "category": "breakdown", "description": "Car won't start",
        "lat": 40.7357, "lng": -74.1724, "address": "Newark, NJ",
    }).json()["request_id"]
    bid = client.post(f"/v1/craft/requests/{rid}/bids", headers=_h(tp), json={
        "price_cents": 8000, "professional_lat": 40.72, "professional_lng": -74.05,
    })
    assert bid.status_code == 201, bid.text
    return tc, tp, rid, bid.json()["bid_id"]


def test_payment_window_hold_then_select_then_capture():
    tc, tp, rid, bid_id = _open_request_with_bid()

    # 1. Customer opens the payment window → a hold intent + client_secret.
    pi = client.post(f"/v1/craft/requests/{rid}/bids/{bid_id}/payment-intent", headers=_h(tc))
    assert pi.status_code == 201, pi.text
    body = pi.json()
    assert body["client_secret"]
    assert body["amount_cents"] == body["base_cents"] + body["service_fee_cents"] + body["tax_cents"]
    assert body["base_cents"] == 8000

    # 2. (Client confirms the hold in Stripe's UI — mocked here.) Select the bid.
    sel = client.post(f"/v1/craft/requests/{rid}/select", headers=_h(tc), json={"bid_id": bid_id})
    assert sel.status_code == 200, sel.text
    assert sel.json()["status"] == "assigned"

    # 3. Drive to completion → the held payment is captured.
    client.patch(f"/v1/craft/requests/{rid}/arrived", headers=_h(tp))
    client.patch(f"/v1/craft/requests/{rid}/confirm-arrival", headers=_h(tc))
    client.patch(f"/v1/craft/requests/{rid}/work-done", headers=_h(tp))
    client.patch(f"/v1/craft/requests/{rid}/complete", headers=_h(tc))

    req = client.get(f"/v1/craft/requests/{rid}", headers=_h(tc)).json()
    assert req["paid_at"] is not None


def test_payment_window_forbidden_for_professional():
    tc, tp, rid, bid_id = _open_request_with_bid()
    r = client.post(f"/v1/craft/requests/{rid}/bids/{bid_id}/payment-intent", headers=_h(tp))
    assert r.status_code in (403, 404), r.text


def test_payment_window_rejected_once_assigned():
    tc, tp, rid, bid_id = _open_request_with_bid()
    client.post(f"/v1/craft/requests/{rid}/select", headers=_h(tc), json={"bid_id": bid_id})
    # Already assigned → can't open a new hold.
    r = client.post(f"/v1/craft/requests/{rid}/bids/{bid_id}/payment-intent", headers=_h(tc))
    assert r.status_code == 422, r.text
