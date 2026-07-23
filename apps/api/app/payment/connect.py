"""Payee-onboarding provider selector.

Drivers and professionals are onboarded to receive payouts through a "connect"
provider. Both ``stripe_connect`` and ``finix_connect`` expose the *same* public
API (``_enabled``, ``account_exists``, ``create_connected_account``,
``create_account_link``, ``get_account_status``, ``get_balance``,
``get_individual_address``), so ``get_connect()`` simply returns the module that
matches ``settings.payout_provider``. Every crud onboarding call site routes
through here, so switching ``PAYOUT_PROVIDER`` re-points **both** roles at once.

Note: Stripe Issuing (debit cards) is Stripe-only; those crud paths keep importing
``stripe_connect`` directly and are inert under Finix (status reports
``card_issuing_active = False``).
"""
from __future__ import annotations

from app.config import settings


def get_connect():
    """Return the onboarding module matching the configured payout provider."""
    if settings.payout_provider == "finix":
        from app.payment import finix_connect  # noqa: PLC0415
        return finix_connect
    from app.payment import stripe_connect  # noqa: PLC0415
    return stripe_connect
