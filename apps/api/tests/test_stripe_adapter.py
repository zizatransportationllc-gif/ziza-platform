"""WS1 (Sprint 68) — StripeAdapter: currency + webhook signature."""
import asyncio
import hashlib
import hmac
import json
import time
import urllib.request

import pytest

from app.payment.stripe_adapter import StripeAdapter


class _FakeResp:
    def __init__(self, body: bytes):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_create_checkout_uses_usd(monkeypatch):
    """The Stripe Checkout session must be created in USD (D1)."""
    captured = {}

    def _fake_urlopen(req):
        captured["body"] = req.data.decode()
        return _FakeResp(json.dumps({"id": "cs_test_123", "url": "https://stripe/pay"}).encode())

    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    adapter = StripeAdapter(secret_key="sk_test", webhook_secret="whsec")

    out = asyncio.run(adapter.create_checkout(
        amount_cents=2599, ref="intent-1", return_url="https://app/return",
    ))

    assert out == {"provider_ref": "cs_test_123", "checkout_url": "https://stripe/pay"}
    from urllib.parse import parse_qs
    q = parse_qs(captured["body"])
    assert q["line_items[0][price_data][currency]"] == ["usd"]
    assert q["line_items[0][price_data][unit_amount]"] == ["2599"]
    assert "xof" not in captured["body"]
    # No split requested → no destination charge fields
    assert "payment_intent_data[transfer_data][destination]" not in captured["body"]


def test_create_checkout_destination_charge(monkeypatch):
    """Sprint 70 — passing destination/application_fee wires a Connect split."""
    captured = {}

    def _fake_urlopen(req):
        captured["body"] = req.data.decode()
        return _FakeResp(json.dumps({"id": "cs_1", "url": "https://stripe/pay"}).encode())

    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    # Dummy, non-secret placeholders (avoid secret-scanner false positives).
    adapter = StripeAdapter(secret_key="sk", webhook_secret="wh")

    asyncio.run(adapter.create_checkout(
        amount_cents=2050, ref="intent-1", return_url="https://app/return",
        destination="acct_123", application_fee_cents=1095,
    ))
    from urllib.parse import parse_qs
    q = parse_qs(captured["body"])
    assert q["payment_intent_data[transfer_data][destination]"] == ["acct_123"]
    assert q["payment_intent_data[application_fee_amount]"] == ["1095"]


def _sign(secret: str, payload: bytes, ts: int) -> str:
    signed = f"{ts}.".encode() + payload
    return hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()


def test_verify_webhook_valid_signature_paid():
    secret = "whsec_test"
    adapter = StripeAdapter(secret_key="sk", webhook_secret=secret)
    payload = json.dumps({
        "type": "checkout.session.completed",
        "data": {"object": {"id": "cs_test_123"}},
    }).encode()
    ts = int(time.time())
    header = {"stripe-signature": f"t={ts},v1={_sign(secret, payload, ts)}"}

    event = asyncio.run(adapter.verify_webhook(payload, header))
    assert event == {"status": "paid", "provider_ref": "cs_test_123"}


def test_verify_webhook_bad_signature_raises():
    adapter = StripeAdapter(secret_key="sk", webhook_secret="whsec_test")
    payload = json.dumps({"type": "checkout.session.completed", "data": {"object": {}}}).encode()
    ts = int(time.time())
    header = {"stripe-signature": f"t={ts},v1=deadbeef"}
    with pytest.raises(ValueError):
        asyncio.run(adapter.verify_webhook(payload, header))
