"""WellsFargoAdapter — Wells Fargo Merchant Services payment gateway (US cards).

Implements the same PaymentAdapter interface as Stripe/CinetPay so it is a
drop-in alternative selected via ``settings.payment_provider == "wellsfargo"``.
The rest of the platform (payment intents, webhook handling, reconciliation,
refunds) is unchanged.

Integration shape (hosted checkout + signed webhook):
  - ``create_checkout`` POSTs a payment session and returns the hosted payment
    page URL + an opaque session/transaction id used to match the webhook.
  - ``verify_webhook`` validates an HMAC-SHA256 signature over the raw body and
    normalises the event to ``{"status": ..., "provider_ref": ...}``.

NOTE: endpoint paths and JSON field names follow the common gateway pattern and
are config-driven (``wellsfargo_api_base``). Confirm them against the Wells Fargo
Merchant Services integration guide for the specific gateway product before going
live; the contract with the rest of ZIZA does not change.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import urllib.request


class WellsFargoAdapter:
    """Wells Fargo Merchant Services payment adapter (US card acquiring)."""

    _provider_name = "wellsfargo"

    def __init__(self, api_base: str, api_key: str, merchant_id: str, webhook_secret: str) -> None:
        self._api_base = api_base.rstrip("/")
        self._api_key = api_key
        self._merchant_id = merchant_id
        self._webhook_secret = webhook_secret

    async def create_checkout(
        self,
        amount_cents: int,
        ref: str,
        return_url: str,
        notify_url: str | None = None,
        *,
        destination: str | None = None,  # Connect split — not supported by WF gateway
        application_fee_cents: int | None = None,
    ) -> dict:
        """Create a hosted payment session.

        Returns ``{"provider_ref": <transaction_id>, "checkout_url": <url>}``.
        Amounts are USD cents (``amount`` field, integer minor units).
        """
        body = json.dumps({
            "merchantId": self._merchant_id,
            "amount": amount_cents,
            "currency": "USD",
            "referenceId": ref,
            "returnUrl": return_url,
            "notifyUrl": notify_url or "",
        }).encode()

        req = urllib.request.Request(
            f"{self._api_base}/checkout/sessions",
            data=body,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                session = json.loads(resp.read())
        except Exception as exc:  # network / gateway error
            raise RuntimeError(f"Wells Fargo checkout creation failed: {exc}") from exc

        provider_ref = session.get("transactionId") or session.get("sessionId")
        checkout_url = session.get("paymentUrl") or session.get("redirectUrl")
        if not provider_ref or not checkout_url:
            raise RuntimeError(f"Wells Fargo returned an unexpected response: {session!r}")
        return {"provider_ref": provider_ref, "checkout_url": checkout_url}

    async def verify_webhook(self, payload: bytes, headers: dict) -> dict:
        """Verify the webhook HMAC signature and normalise the event.

        Expects an ``X-WF-Signature`` header = hex HMAC-SHA256 of the raw body
        with ``wellsfargo_webhook_secret``. Raises ``ValueError`` on bad
        signature, malformed body, or unhandled event type.
        """
        # Header lookup is case-insensitive across servers.
        sig = headers.get("x-wf-signature") or headers.get("X-WF-Signature", "")
        if not sig:
            raise ValueError("Missing Wells Fargo webhook signature")

        expected = hmac.new(
            self._webhook_secret.encode(), payload, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError("Invalid Wells Fargo webhook signature")

        try:
            event = json.loads(payload)
        except Exception as exc:
            raise ValueError(f"Malformed Wells Fargo webhook payload: {exc}") from exc

        # Match the intent by the transaction id we stored as provider_ref.
        provider_ref = event.get("transactionId") or event.get("sessionId") or ""
        status = (event.get("status") or event.get("eventType") or "").lower()

        if status in ("paid", "captured", "completed", "settled", "approved"):
            return {"status": "paid", "provider_ref": provider_ref}
        if status in ("failed", "declined", "cancelled", "canceled", "expired", "voided"):
            return {"status": "failed", "provider_ref": provider_ref}
        raise ValueError(f"Unhandled Wells Fargo event status: {status!r}")
