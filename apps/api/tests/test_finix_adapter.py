"""FinixAdapter tests — charge mapping + webhook Basic-auth verification.

Network-free: the HTTP helpers (``_post`` / ``_get``) are monkeypatched, so these
run in CI without touching Finix. Async methods are driven via ``asyncio.run``.
"""
import asyncio
import base64
import json

import pytest

from app.payment.finix_adapter import FinixAdapter


def _adapter() -> FinixAdapter:
    return FinixAdapter(
        api_base="https://finix.sandbox-payments-api.com",
        username="USsr_test",
        password="pw_test",
        version="2022-02-01",
        platform_merchant_id="MUplatform",
        webhook_username="hookuser",
        webhook_password="hookpass",
    )


def _basic(user: str, pw: str) -> str:
    return "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode()


# --------------------------------------------------------------------- checkout
def test_create_checkout_split_maps_destination_and_fee(monkeypatch):
    """A split charge targets the payee merchant and retains the platform fee."""
    captured = {}

    def fake_post(path, body):
        captured["path"] = path
        captured["body"] = body
        return {"id": "PLxyz", "link_url": "https://checkout.finix.com/PLxyz"}

    a = _adapter()
    monkeypatch.setattr(a, "_post", fake_post)

    out = asyncio.run(a.create_checkout(
        amount_cents=11000, ref="intent-1", return_url="https://app.ziza.live/return",
        destination="MUpayee", application_fee_cents=1000,
    ))

    assert captured["path"] == "/payment_links"
    assert captured["body"]["merchant_id"] == "MUpayee"
    assert captured["body"]["amount_details"]["amount"] == 11000
    assert captured["body"]["fee"] == 1000
    assert captured["body"]["tags"]["ziza_ref"] == "intent-1"
    assert out == {"provider_ref": "PLxyz", "checkout_url": "https://checkout.finix.com/PLxyz"}


def test_create_checkout_no_destination_uses_platform_merchant(monkeypatch):
    """A plain charge (wallet top-up) settles to the platform merchant, no fee."""
    captured = {}
    monkeypatch.setattr(_ad := _adapter(), "_post",
                        lambda path, body: captured.update(body) or {"id": "PL1", "link_url": "u"})
    asyncio.run(_ad.create_checkout(5000, "intent-2", "https://app.ziza.live/return"))
    assert captured["merchant_id"] == "MUplatform"
    assert "fee" not in captured


# ---------------------------------------------------------------------- webhook
def test_verify_webhook_accepts_valid_basic_auth_and_marks_paid():
    a = _adapter()
    payload = json.dumps({
        "type": "updated", "entity": "payment_link",
        "_embedded": {"payment_links": [{"id": "PLxyz", "state": "COMPLETED"}]},
    }).encode()
    headers = {"authorization": _basic("hookuser", "hookpass")}
    out = asyncio.run(a.verify_webhook(payload, headers))
    assert out == {"status": "paid", "provider_ref": "PLxyz"}


def test_verify_webhook_rejects_wrong_credentials():
    a = _adapter()
    payload = json.dumps({"_embedded": {"payment_links": [{"id": "x", "state": "COMPLETED"}]}}).encode()
    headers = {"authorization": _basic("hookuser", "WRONG")}
    with pytest.raises(ValueError):
        asyncio.run(a.verify_webhook(payload, headers))


def test_verify_webhook_maps_failed_state():
    a = _adapter()
    payload = json.dumps({
        "_embedded": {"payment_links": [{"id": "PLzzz", "state": "EXPIRED"}]},
    }).encode()
    headers = {"authorization": _basic("hookuser", "hookpass")}
    out = asyncio.run(a.verify_webhook(payload, headers))
    assert out == {"status": "failed", "provider_ref": "PLzzz"}
