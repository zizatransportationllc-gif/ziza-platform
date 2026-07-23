"""Payee-onboarding provider selector.

Drivers and professionals are onboarded to receive payouts through a "connect"
provider. Both ``stripe_connect`` and ``finix_connect`` expose the *same* public
API (``_enabled``, ``account_exists``, ``create_connected_account``,
``create_account_link``, ``get_account_status``, ``get_balance``,
``get_individual_address``), so ``get_connect(provider)`` simply returns the
module that matches the provider.

A payee picks their provider at "Set up payouts" (stored on the driver /
professional row); every crud call site passes that stored value so all provider
operations on a payee stay on the provider they onboarded with. When no provider
is given, ``settings.payout_provider`` is used as the fallback.

Note: Stripe Issuing (debit cards) is Stripe-only; those crud paths keep importing
``stripe_connect`` directly and are inert under Finix (status reports
``card_issuing_active = False``).
"""
from __future__ import annotations

from app.config import settings


def get_connect(provider: str | None = None):
    """Return the onboarding module for ``provider`` (falls back to the global).

    ``provider`` is the payee's chosen payout provider ("stripe" | "finix"); when
    ``None`` (unknown / legacy payee) ``settings.payout_provider`` is used.
    """
    prov = provider or settings.payout_provider
    if prov == "finix":
        from app.payment import finix_connect  # noqa: PLC0415
        return finix_connect
    from app.payment import stripe_connect  # noqa: PLC0415
    return stripe_connect
