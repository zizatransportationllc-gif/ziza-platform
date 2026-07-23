"""Finix payee-onboarding facade + dev/CI fakes.

Network-free: with no Finix credentials configured (the CI default) every
``finix_connect`` function returns deterministic fakes, so onboarding runs end to
end without touching Finix. Also checks that ``get_connect()`` routes on
``payout_provider``.
"""
from app.config import settings
from app.payment import finix_connect, stripe_connect
from app.payment.connect import get_connect


def test_get_connect_routes_on_payout_provider(monkeypatch):
    monkeypatch.setattr(settings, "payout_provider", "finix")
    assert get_connect() is finix_connect
    monkeypatch.setattr(settings, "payout_provider", "stripe")
    assert get_connect() is stripe_connect
    monkeypatch.setattr(settings, "payout_provider", "mock")
    assert get_connect() is stripe_connect  # default when not finix


def test_finix_connect_dev_fakes_are_stripe_shaped():
    """Same public shape as stripe_connect so the facade is a drop-in."""
    # No creds in CI → _enabled() is False → deterministic fakes.
    assert finix_connect._enabled() is False

    account_id = finix_connect.create_connected_account("pro@ziza.dev")
    assert account_id.startswith("MU_mock_")
    assert finix_connect.account_exists(account_id) is True
    assert finix_connect.account_exists("") is True  # dev treats every id as valid

    url = finix_connect.create_account_link(account_id, "https://ret", "https://ref")
    assert account_id in url

    st = finix_connect.get_account_status(account_id)
    assert set(st) == {
        "payouts_enabled", "charges_enabled", "details_submitted", "card_issuing_active",
    }
    assert st["payouts_enabled"] is True
    assert st["card_issuing_active"] is False  # Issuing is Stripe-only

    bal = finix_connect.get_balance(account_id)
    assert bal == {"available_cents": 0, "pending_cents": 0}
    assert finix_connect.get_individual_address(account_id) is None
