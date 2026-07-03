"""StripeAdapter — Sprint 24.

Production adapter for Stripe (international credit / debit cards).
Requires ``stripe_secret_key`` and ``stripe_webhook_secret`` settings.

Docs: https://stripe.com/docs/api
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time


class StripeAdapter:
    """Stripe payment adapter (international cards)."""

    _provider_name = "stripe"
    _API_BASE = "https://api.stripe.com/v1"

    def __init__(self, secret_key: str, webhook_secret: str) -> None:
        self._secret_key = secret_key
        self._webhook_secret = webhook_secret

    async def create_checkout(
        self,
        amount_cents: int,
        ref: str,
        return_url: str,
        notify_url: str | None = None,  # unused by Stripe (webhook registered in dashboard)
        *,
        destination: str | None = None,
        application_fee_cents: int | None = None,
    ) -> dict:
        """Create a Stripe Checkout Session.

        Returns ``{"provider_ref": session_id, "checkout_url": url}``.

        Note: Stripe amounts are in the smallest currency unit. USD is a
        two-decimal currency, so ``amount_cents`` (USD cents) maps directly to
        Stripe's ``unit_amount``.

        Sprint 70 — Connect destination charge: when ``destination`` (a connected
        account id) is given, the underlying PaymentIntent is created with
        ``transfer_data[destination]`` (the payee's share is transferred to them)
        and ``application_fee_amount`` (what Ziza keeps). Stripe's processing fee
        is deducted from the platform balance.
        """
        import urllib.parse  # noqa: PLC0415
        import urllib.request  # noqa: PLC0415

        fields = {
            "payment_method_types[]": "card",
            "line_items[0][price_data][currency]": "usd",
            "line_items[0][price_data][product_data][name]": "Ziza ride",
            "line_items[0][price_data][unit_amount]": amount_cents,
            "line_items[0][quantity]": 1,
            "mode": "payment",
            "success_url": return_url,
            "cancel_url": return_url,
            "client_reference_id": ref,
        }
        if destination is not None:
            fields["payment_intent_data[transfer_data][destination]"] = destination
        if application_fee_cents is not None:
            fields["payment_intent_data[application_fee_amount]"] = application_fee_cents
        payload = urllib.parse.urlencode(fields).encode()

        req = urllib.request.Request(
            f"{self._API_BASE}/checkout/sessions",
            data=payload,
            headers={
                "Authorization": f"Bearer {self._secret_key}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        with urllib.request.urlopen(req) as resp:
            session = json.loads(resp.read())

        return {
            "provider_ref": session["id"],
            "checkout_url": session["url"],
        }

    async def verify_webhook(
        self,
        payload: bytes,
        headers: dict,
    ) -> dict:
        """Verify Stripe webhook signature and return normalised event data.

        Stripe signs webhooks with ``Stripe-Signature`` header using
        HMAC-SHA256 of ``{timestamp}.{payload}`` and the webhook secret.

        Raises ``ValueError`` on invalid signature, expired timestamp
        (>300 s), or unrecognised event type.
        """
        sig_header = headers.get("stripe-signature", "")

        # Parse the Stripe-Signature header: t=<ts>,v1=<sig>,...
        parts: dict[str, str] = {}
        for part in sig_header.split(","):
            if "=" in part:
                k, v = part.split("=", 1)
                parts[k.strip()] = v.strip()

        ts = parts.get("t", "")
        v1 = parts.get("v1", "")
        if not ts or not v1:
            raise ValueError("Missing Stripe-Signature header fields")

        # Replay attack guard: reject events older than 5 minutes
        try:
            if abs(time.time() - int(ts)) > 300:
                raise ValueError("Stripe webhook timestamp too old")
        except (TypeError, ValueError):
            raise ValueError("Invalid timestamp in Stripe-Signature")

        # Compute expected signature
        signed_payload = f"{ts}.".encode() + payload
        expected = hmac.new(
            self._webhook_secret.encode(),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(v1, expected):
            raise ValueError("Invalid Stripe webhook signature")

        try:
            event = json.loads(payload)
        except Exception as exc:
            raise ValueError(f"Malformed Stripe webhook payload: {exc}") from exc

        event_type = event.get("type", "")
        obj = event.get("data", {}).get("object", {})

        if event_type == "checkout.session.completed":
            return {
                "status": "paid",
                "provider_ref": obj.get("id", ""),
            }
        if event_type in ("payment_intent.payment_failed", "checkout.session.expired"):
            return {
                "status": "failed",
                "provider_ref": obj.get("id", obj.get("client_reference_id", "")),
            }

        raise ValueError(f"Unhandled Stripe event type: {event_type!r}")

    async def refund(self, provider_ref: str, amount_cents: int | None = None) -> str:
        """Refund a payment. ``provider_ref`` is the Checkout Session id, so we
        first resolve its ``payment_intent`` then create the refund (idempotent)."""
        import urllib.parse  # noqa: PLC0415
        import urllib.request  # noqa: PLC0415

        # Resolve the payment_intent from the session.
        sess_req = urllib.request.Request(
            f"{self._API_BASE}/checkout/sessions/{provider_ref}",
            headers={"Authorization": f"Bearer {self._secret_key}"},
        )
        with urllib.request.urlopen(sess_req) as resp:
            session = json.loads(resp.read())
        payment_intent = session.get("payment_intent")
        if not payment_intent:
            raise RuntimeError("No payment_intent on the checkout session to refund")

        fields = {"payment_intent": payment_intent}
        if amount_cents:
            fields["amount"] = amount_cents
        req = urllib.request.Request(
            f"{self._API_BASE}/refunds",
            data=urllib.parse.urlencode(fields).encode(),
            headers={
                "Authorization": f"Bearer {self._secret_key}",
                "Content-Type": "application/x-www-form-urlencoded",
                "Idempotency-Key": f"refund_{provider_ref}",
            },
        )
        with urllib.request.urlopen(req) as resp:
            refund = json.loads(resp.read())
        return refund["id"]
