"""PayoutAdapter — Sprint 29 → WS3 (Sprint 68).

Sends real money payouts to drivers / professionals. Two real rails are
available, selected via ``payout_provider``:
  - ``stripe``     → Stripe Connect transfers to the payee's connected account.
  - ``wellsfargo`` → Wells Fargo Gateway ACH/RTP credit to the payee's US bank.

The mock adapter is used in dev / CI.
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


class WellsFargoPayoutAdapter:
    """Wells Fargo Gateway payout via ACH / RTP / wire (US bank rails).

    Sends ``amount_cents`` from the platform's WF funding account to the payee's
    destination account reference (``account_id``), with an idempotency key so
    retries never double-pay.

    NOTE: WF Gateway uses OAuth2 + mutual TLS in production; the endpoint path and
    field names follow the common payments pattern and are config-driven. Confirm
    them against the Wells Fargo Gateway integration guide before going live; the
    contract with the ZIZA payout batch does not change.
    """

    _provider_name = "wellsfargo"

    def __init__(self, base: str, api_key: str, funding_account: str, rail: str) -> None:
        self._base = base.rstrip("/")
        self._api_key = api_key
        self._funding_account = funding_account
        self._rail = rail

    async def send_payout(self, *, account_id: str, amount_cents: int, ref: str) -> str:
        if not account_id:
            raise RuntimeError("Payee has no destination bank account on file")
        body = json.dumps({
            "fundingAccount": self._funding_account,
            "destinationAccount": account_id,
            "amount": amount_cents,
            "currency": "USD",
            "rail": self._rail,
            "referenceId": ref,
        }).encode()
        req = urllib.request.Request(
            f"{self._base}/payments",
            data=body,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Idempotency-Key": f"payout_{ref}",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                payment = json.loads(resp.read())
        except Exception as exc:
            raise RuntimeError(f"Wells Fargo payout failed: {exc}") from exc
        payout_ref = payment.get("paymentId") or payment.get("id")
        if not payout_ref:
            raise RuntimeError(f"Wells Fargo returned an unexpected response: {payment!r}")
        return payout_ref


def get_payout_adapter(provider: str) -> PayoutAdapter:
    """Factory — returns the correct adapter based on ``provider``."""
    from app.config import settings  # noqa: PLC0415
    if provider == "stripe":
        return StripePayoutAdapter(secret_key=settings.stripe_secret_key)
    if provider == "wellsfargo":
        return WellsFargoPayoutAdapter(
            base=settings.wellsfargo_gateway_base,
            api_key=settings.wellsfargo_gateway_api_key,
            funding_account=settings.wellsfargo_funding_account,
            rail=settings.wellsfargo_payment_rail,
        )
    return MockPayoutAdapter()
