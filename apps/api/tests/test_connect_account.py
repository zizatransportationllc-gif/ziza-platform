"""Sprint 71 — Stripe Connect account creation uses a Custom (Issuing-ready) config.

Custom connected accounts are required for Stripe Issuing. This asserts the
account-creation payload requests the controller config + card_issuing capability
when Stripe is enabled, and still returns a deterministic fake in dev/CI.
"""
from app.payment import stripe_connect


def test_create_connected_account_mock_without_key():
    """No Stripe key → deterministic fake account id (dev/CI)."""
    acct = stripe_connect.create_connected_account("driver@ziza.dev")
    assert acct.startswith("acct_mock_")


def test_create_connected_account_custom_payload(monkeypatch):
    """With Stripe enabled, the account is created as Custom + Issuing-ready."""
    captured = {}

    monkeypatch.setattr(stripe_connect, "_enabled", lambda: True)

    def _fake_post(path, fields):
        captured["path"] = path
        captured["fields"] = fields
        return {"id": "acct_test_123"}

    monkeypatch.setattr(stripe_connect, "_post", _fake_post)

    acct = stripe_connect.create_connected_account("driver@ziza.dev")
    assert acct == "acct_test_123"
    assert captured["path"] == "/accounts"
    f = captured["fields"]
    # Custom controller configuration (no express type)
    assert "type" not in f
    assert f["controller[stripe_dashboard][type]"] == "none"
    assert f["controller[losses][payments]"] == "application"
    assert f["controller[requirement_collection]"] == "application"
    # Capabilities: transfers (split) + card_issuing (debit card)
    assert f["capabilities[transfers][requested]"] == "true"
    assert f["capabilities[card_issuing][requested]"] == "true"
    assert f["email"] == "driver@ziza.dev"
