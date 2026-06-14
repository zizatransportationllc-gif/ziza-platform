"""PayoutAdapter — Sprint 29 → WS3 (Sprint 68).

Sends real money payouts to drivers / professionals. Since D3 = Stripe, the
real rail is **Stripe Connect**: funds are transferred from the platform balance
to the payee's connected account (which Stripe then pays out to their bank).

The mock adapter is used in dev / CI; the Stripe adapter is wired in production
via the ``payout_provider`` config setting.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Protocol


class PayoutAdapter(Protocol):
    """Minimal interface required by the batch payout runner."""

    async def send_payout(self, *, account_id: str, amount_cents: int, ref: str) -> str:
        """Send ``amount_cents`` (USD cents) to the payee's connected account.

        ``ref`` is a stable unique reference (the payout request id) used as an
        idempotency key so retries never double-pay.

        Returns an opaque ``provider_ref`` on success. Raises ``RuntimeError``
        on failure (the caller marks the request ``failed`` and continues).
        """
        ...


class MockPayoutAdapter:
    """Always succeeds — returns a deterministic fake reference (dev / CI / tests)."""

    async def send_payout(self, *, account_id: str, amount_cents: int, ref: str) -> str:
        return f"mock_payout_{ref}"


class StripePayoutAdapter:
    """Stripe Connect payout via the Transfers API (idempotent)."""

    _provider_name = "stripe"
    _API_BASE = "https://api.stripe.com/v1"

    def __init__(self, secret_key: str) -> None:
        self._secret_key = secret_key

    async def send_payout(self, *, account_id: str, amount_cents: int, ref: str) -> str:
        if not account_id:
            raise RuntimeError("Payee has no connected Stripe account")
        payload = urllib.parse.urlencode({
            "amount": amount_cents,
            "currency": "usd",
            "destination": account_id,
            "transfer_group": ref,
        }).encode()
        req = urllib.request.Request(
            f"{self._API_BASE}/transfers",
            data=payload,
            headers={
                "Authorization": f"Bearer {self._secret_key}",
                "Content-Type": "application/x-www-form-urlencoded",
                # Idempotency key — Stripe collapses retries with the same key.
                "Idempotency-Key": f"payout_{ref}",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                transfer = json.loads(resp.read())
        except Exception as exc:  # network / Stripe error
            raise RuntimeError(f"Stripe transfer failed: {exc}") from exc
        return transfer["id"]


def get_payout_adapter(provider: str) -> PayoutAdapter:
    """Factory — returns the correct adapter based on ``provider``."""
    if provider == "stripe":
        from app.config import settings  # noqa: PLC0415
        return StripePayoutAdapter(secret_key=settings.stripe_secret_key)
    return MockPayoutAdapter()
