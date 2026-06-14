"""Wells Fargo Gateway payout adapter (ACH/RTP) — WS3 alternative rail."""
import asyncio
import json
import urllib.request

import pytest

import app.config as _config
from app.payment.payout_adapter import (
    WellsFargoPayoutAdapter,
    MockPayoutAdapter,
    StripePayoutAdapter,
    get_payout_adapter,
)


class _FakeResp:
    def __init__(self, body: bytes):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _adapter() -> WellsFargoPayoutAdapter:
    return WellsFargoPayoutAdapter(
        base="https://api.wf.test/payments/v1",
        api_key="key_test",
        funding_account="WF-FUND-1",
        rail="ach",
    )


def test_send_payout_posts_ach_and_returns_ref(monkeypatch):
    captured = {}

    def _fake_urlopen(req):
        captured["url"] = req.full_url
        captured["body"] = json.loads(req.data.decode())
        captured["idem"] = req.headers.get("Idempotency-key") or req.headers.get("Idempotency-Key")
        return _FakeResp(json.dumps({"paymentId": "wf_pay_1"}).encode())

    monkeypatch.setattr(urllib.request, "urlopen", _fake_urlopen)
    ref = asyncio.run(_adapter().send_payout(account_id="BANK-ACCT-9", amount_cents=12_345, ref="payout-1"))

    assert ref == "wf_pay_1"
    assert captured["url"].endswith("/payments")
    b = captured["body"]
    assert b["fundingAccount"] == "WF-FUND-1"
    assert b["destinationAccount"] == "BANK-ACCT-9"
    assert b["amount"] == 12_345
    assert b["currency"] == "USD"
    assert b["rail"] == "ach"
    assert captured["idem"] == "payout_payout-1"


def test_send_payout_without_account_raises():
    with pytest.raises(RuntimeError):
        asyncio.run(_adapter().send_payout(account_id="", amount_cents=100, ref="x"))


def test_send_payout_gateway_error_raises(monkeypatch):
    def _boom(req):
        raise OSError("gateway down")

    monkeypatch.setattr(urllib.request, "urlopen", _boom)
    with pytest.raises(RuntimeError):
        asyncio.run(_adapter().send_payout(account_id="A", amount_cents=100, ref="x"))


def test_factory_selects_payout_provider(monkeypatch):
    monkeypatch.setattr(_config.settings, "payout_provider", "wellsfargo", raising=False)
    assert isinstance(get_payout_adapter("wellsfargo"), WellsFargoPayoutAdapter)
    assert isinstance(get_payout_adapter("stripe"), StripePayoutAdapter)
    assert isinstance(get_payout_adapter("mock"), MockPayoutAdapter)
