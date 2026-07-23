"""PayoutAdapter — Sprint 29 → WS3 (Sprint 68) → Sprint 69.

Sends real money payouts to drivers / professionals. Two real rails are
available, selected via ``payout_provider``:
  - ``stripe``     → Stripe Connect transfers to the payee's connected account.
  - ``wellsfargo`` → Wells Fargo Gateway ACH/RTP credit to the payee's US bank.

The mock adapter is used in dev / CI.

The payout **destination** is a provider-specific dict resolved by the batch:
  - Stripe : ``{"account_id": "acct_..."}``
  - Wells Fargo : ``{"routing": "...", "account": "...", "holder": "..."}``
"""
from __future__ import annotations

import base64
import json
import urllib.request
from typing import Protocol


class PayoutAdapter(Protocol):
    """Minimal interface required by the batch payout runner."""

    async def send_payout(self, *, destination: dict, amount_cents: int, ref: str) -> str:
        """Send ``amount_cents`` (USD cents) to ``destination``.

        ``ref`` is a stable unique reference (the payout request id) used as an
        idempotency key so retries never double-pay. Returns an opaque
        ``provider_ref`` on success; raises ``RuntimeError`` on failure.
        """
        ...


class MockPayoutAdapter:
    """Always succeeds — returns a deterministic fake reference (dev / CI / tests)."""

    async def send_payout(self, *, destination: dict, amount_cents: int, ref: str) -> str:
        return f"mock_payout_{ref}"


class StripePayoutAdapter:
    """Stripe Connect payout via the Transfers API (idempotent)."""

    _provider_name = "stripe"
    _API_BASE = "https://api.stripe.com/v1"

    def __init__(self, secret_key: str) -> None:
        self._secret_key = secret_key

    async def send_payout(self, *, destination: dict, amount_cents: int, ref: str) -> str:
        import urllib.parse  # noqa: PLC0415

        account_id = destination.get("account_id")
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
                "Idempotency-Key": f"payout_{ref}",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                transfer = json.loads(resp.read())
        except Exception as exc:
            raise RuntimeError(f"Stripe transfer failed: {exc}") from exc
        return transfer["id"]


class WellsFargoPayoutAdapter:
    """Wells Fargo Gateway payout via ACH / RTP / wire (US bank rails).

    Sends ``amount_cents`` from the platform's WF funding account to the payee's
    bank account (routing + account number), with an idempotency key.

    NOTE: WF Gateway uses OAuth2 + mutual TLS in production; the endpoint path and
    field names follow the common payments pattern and are config-driven. Confirm
    them against the Wells Fargo Gateway integration guide before going live.
    """

    _provider_name = "wellsfargo"

    def __init__(self, base: str, api_key: str, funding_account: str, rail: str) -> None:
        self._base = base.rstrip("/")
        self._api_key = api_key
        self._funding_account = funding_account
        self._rail = rail

    async def send_payout(self, *, destination: dict, amount_cents: int, ref: str) -> str:
        routing = destination.get("routing")
        account = destination.get("account")
        if not routing or not account:
            raise RuntimeError("Payee has no destination bank account on file")
        body = json.dumps({
            "fundingAccount": self._funding_account,
            "destination": {
                "routingNumber": routing,
                "accountNumber": account,
                "accountHolderName": destination.get("holder", ""),
            },
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


class FinixPayoutAdapter:
    """Finix payout via a CREDIT Transfer to the payee's bank Payment Instrument.

    ``destination`` carries the Finix ids resolved by the batch:
      ``{"merchant_id": "MU…", "payment_instrument": "PI…"}``.

    NOTE: on Finix, a payee's charges normally settle to their Merchant
    automatically; this explicit CREDIT path is for on-demand payouts. Confirm
    the transfer ``type``/field names against the Finix payouts guide before
    going live (SANDBOX SCAFFOLD).
    """

    _provider_name = "finix"

    def __init__(self, *, api_base: str, username: str, password: str, version: str) -> None:
        self._api_base = api_base.rstrip("/")
        self._username = username
        self._password = password
        self._version = version

    async def send_payout(self, *, destination: dict, amount_cents: int, ref: str) -> str:
        merchant_id = destination.get("merchant_id")
        instrument = destination.get("payment_instrument")
        if not merchant_id or not instrument:
            raise RuntimeError("Payee has no Finix merchant / payment instrument on file")
        token = base64.b64encode(f"{self._username}:{self._password}".encode()).decode()
        body = json.dumps({
            "type": "CREDIT",
            "merchant": merchant_id,
            "destination": instrument,
            "amount": amount_cents,
            "currency": "USD",
            # Finix uses a body idempotency key (not a header) — retries never double-pay.
            "idempotency_id": f"payout_{ref}",
            "tags": {"ziza_ref": ref},
        }).encode()
        req = urllib.request.Request(
            f"{self._api_base}/transfers",
            data=body,
            headers={
                "Authorization": f"Basic {token}",
                "Content-Type": "application/json",
                "Accept": "application/hal+json",
                "Finix-Version": self._version,
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                transfer = json.loads(resp.read())
        except Exception as exc:
            raise RuntimeError(f"Finix payout failed: {exc}") from exc
        payout_ref = transfer.get("id")
        if not payout_ref:
            raise RuntimeError(f"Finix returned an unexpected response: {transfer!r}")
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
    if provider == "finix":
        return FinixPayoutAdapter(
            api_base=settings.finix_api_base,
            username=settings.finix_username,
            password=settings.finix_password,
            version=settings.finix_version,
        )
    return MockPayoutAdapter()
