"""Wells Fargo Merchant Services payment adapter (US card acquiring)."""
import asyncio
import hashlib
import hmac
import json
import urllib.request

import pytest

import app.config as _config
from app.payment import get_adapter
from app.payment.wellsfargo import WellsFargoAdapter


class _FakeResp:
    def __init__(self, body: bytes):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _adapter() -> WellsFargoAdapter:
    return WellsFargoAdapter(
        api_base="https://api.wf.test/v1",
        api_key="key_test",
        merchant_id="MID123",
        webhook_secret="whsec_wf",
    )


def test_create_checkout_posts_usd_and_returns_refs(monkeypatch):
    captured = {}

    def _fake_urlopen(req):
        captured["url"] = req.full_url
        captured["body"] = json.loads(req.data.decode())
        return _FakeResp(json.dumps({
            "transactionId": "wf_txn_1", "paymentUrl": "https://pay.wf.test/abc",
        }).encode())

    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    out = asyncio.run(_adapter().create_checkout(
        amount_cents=2599, ref="intent-1", return_url="https://app/return",
    ))

    assert out == {"provider_ref": "wf_txn_1", "checkout_url": "https://pay.wf.test/abc"}
    assert captured["url"].endswith("/checkout/sessions")
    assert captured["body"]["currency"] == "USD"
    assert captured["body"]["amount"] == 2599
    assert captured["body"]["merchantId"] == "MID123"
    assert captured["body"]["referenceId"] == "intent-1"


def _sign(secret: str, payload: bytes) -> str:
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def test_verify_webhook_valid_paid():
    adapter = _adapter()
    payload = json.dumps({"transactionId": "wf_txn_1", "status": "captured"}).encode()
    headers = {"x-wf-signature": _sign("whsec_wf", payload)}
    event = asyncio.run(adapter.verify_webhook(payload, headers))
    assert event == {"status": "paid", "provider_ref": "wf_txn_1"}


def test_verify_webhook_failed_status():
    adapter = _adapter()
    payload = json.dumps({"transactionId": "wf_txn_2", "status": "declined"}).encode()
    headers = {"x-wf-signature": _sign("whsec_wf", payload)}
    event = asyncio.run(adapter.verify_webhook(payload, headers))
    assert event == {"status": "failed", "provider_ref": "wf_txn_2"}


def test_verify_webhook_bad_signature_raises():
    adapter = _adapter()
    payload = json.dumps({"transactionId": "x", "status": "captured"}).encode()
    with pytest.raises(ValueError):
        asyncio.run(adapter.verify_webhook(payload, {"x-wf-signature": "deadbeef"}))


def test_verify_webhook_missing_signature_raises():
    adapter = _adapter()
    with pytest.raises(ValueError):
        asyncio.run(adapter.verify_webhook(b"{}", {}))


def test_factory_selects_wellsfargo(monkeypatch):
    monkeypatch.setattr(_config.settings, "payment_provider", "wellsfargo", raising=False)
    adapter = get_adapter()
    assert isinstance(adapter, WellsFargoAdapter)
    assert getattr(adapter, "_provider_name", None) == "wellsfargo"
