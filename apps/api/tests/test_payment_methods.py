"""Sprint 73 — saved card management (Stripe Customer + PaymentMethods).

In CI (no stripe_secret_key) the stripe_cards module returns deterministic
fakes, so these exercise the endpoints/wiring without touching Stripe.
"""
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def _tok(email: str = "customer@ziza.dev") -> str:
    r = client.post("/v1/token", json={"email": email, "password": settings.auth_dev_password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def test_setup_intent_requires_auth():
    assert client.post("/v1/payments/methods/setup-intent").status_code == 401


def test_setup_intent_creates_customer_and_secret():
    tok = _tok()
    client.post("/v1/auth/register", headers=_h(tok))
    r = client.post("/v1/payments/methods/setup-intent", headers=_h(tok))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["client_secret"]
    assert body["customer_id"].startswith("cus_")


def test_list_cards_initially_empty():
    tok = _tok()
    client.post("/v1/auth/register", headers=_h(tok))
    r = client.get("/v1/payments/methods", headers=_h(tok))
    assert r.status_code == 200
    assert r.json() == []


def test_delete_unknown_card_404():
    tok = _tok()
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/payments/methods/setup-intent", headers=_h(tok))  # ensure customer
    r = client.delete("/v1/payments/methods/pm_does_not_exist", headers=_h(tok))
    assert r.status_code == 404, r.text


def test_set_default_unknown_card_404():
    tok = _tok()
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/payments/methods/setup-intent", headers=_h(tok))
    r = client.post("/v1/payments/methods/pm_nope/default", headers=_h(tok))
    assert r.status_code == 404, r.text


def test_stripe_cards_mock_helpers():
    from app.payment import stripe_cards

    cid = stripe_cards.create_customer("x@y.com", "X Y")
    assert cid.startswith("cus_mock_")
    si = stripe_cards.create_setup_intent(cid)
    assert si["id"].startswith("seti_mock_") and si["client_secret"]
    assert stripe_cards.list_payment_methods(cid) == []
    assert stripe_cards.get_default_payment_method(cid) is None
