"""Payment adapter package — Sprint 24.

Exposes a ``get_adapter()`` factory that returns the right backend based on
``settings.payment_provider``:

  "mock"        → MockPaymentAdapter   (dev / CI / tests)
  "cinetpay"    → CinetPayAdapter      (West Africa)
  "stripe"      → StripeAdapter        (international cards)
  "wellsfargo"  → WellsFargoAdapter    (US cards — Wells Fargo Merchant Services)
  "finix"       → FinixAdapter         (US marketplace acquiring + split)
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
    if provider == "wellsfargo":
        from app.payment.wellsfargo import WellsFargoAdapter  # noqa: PLC0415
        return WellsFargoAdapter(
            api_base=settings.wellsfargo_api_base,
            api_key=settings.wellsfargo_api_key,
            merchant_id=settings.wellsfargo_merchant_id,
            webhook_secret=settings.wellsfargo_webhook_secret,
        )
    if provider == "finix":
        from app.payment.finix_adapter import FinixAdapter  # noqa: PLC0415
        return FinixAdapter(
            api_base=settings.finix_api_base,
            username=settings.finix_username,
            password=settings.finix_password,
            version=settings.finix_version,
            platform_merchant_id=settings.finix_platform_merchant_id,
            webhook_username=settings.finix_webhook_username,
            webhook_password=settings.finix_webhook_password,
        )
    # Default: mock adapter (safe fallback for dev / CI)
    from app.payment.mock import MockPaymentAdapter  # noqa: PLC0415
    return MockPaymentAdapter()
