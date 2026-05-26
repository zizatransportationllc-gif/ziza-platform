"""Payment adapter package — Sprint 24.

Exposes a ``get_adapter()`` factory that returns the right backend based on
``settings.payment_provider``:

  "mock"      → MockPaymentAdapter   (dev / CI / tests)
  "cinetpay"  → CinetPayAdapter      (West Africa)
  "stripe"    → StripeAdapter        (international cards)
"""
from __future__ import annotations

from app.config import settings


def get_adapter():
    """Return the payment adapter matching the current environment setting."""
    provider = settings.payment_provider
    if provider == "cinetpay":
        from app.payment.cinetpay import CinetPayAdapter  # noqa: PLC0415
        return CinetPayAdapter(
            api_key=settings.cinetpay_api_key,
            site_id=settings.cinetpay_site_id,
        )
    if provider == "stripe":
        from app.payment.stripe_adapter import StripeAdapter  # noqa: PLC0415
        return StripeAdapter(
            secret_key=settings.stripe_secret_key,
            webhook_secret=settings.stripe_webhook_secret,
        )
    # Default: mock adapter (safe fallback for dev / CI)
    from app.payment.mock import MockPaymentAdapter  # noqa: PLC0415
    return MockPaymentAdapter()
