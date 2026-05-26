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
        amount_xof: int,
        ref: str,
        return_url: str,
    ) -> dict:
        """Create a Stripe Checkout Session.

        Returns ``{"provider_ref": session_id, "checkout_url": url}``.

        Note: Stripe amounts are in the smallest currency unit.
        For XOF (zero-decimal currency) ``amount_xof`` is used directly.
        """
        import urllib.parse  # noqa: PLC0415
        import urllib.request  # noqa: PLC0415

        payload = urllib.parse.urlencode({
            "payment_method_types[]": "card",
            "line_items[0][price_data][currency]": "xof",
            "line_items[0][price_data][product_data][name]": "Ziza ride",
            "line_items[0][price_data][unit_amount]": amount_xof,
            "line_items[0][quantity]": 1,
            "mode": "payment",
            "success_url": return_url,
            "cancel_url": return_url,
            "client_reference_id": ref,
        }).encode()

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
