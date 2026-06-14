"""MockPaymentAdapter — Sprint 24 (tests & dev only).

Simulates the payment provider:
  - ``create_checkout`` always returns a fake URL.
  - ``verify_webhook``  parses plain JSON — no cryptographic signature check.
"""
from __future__ import annotations

import json


class MockPaymentAdapter:
    """Drop-in payment adapter for development and automated tests."""

    _provider_name = "mock"

    async def create_checkout(
        self,
        amount_cents: int,
        ref: str,
        return_url: str,
        notify_url: str | None = None,
    ) -> dict:
        """Return a deterministic fake checkout URL."""
        return {
            "provider_ref": f"mock-{ref}",
            "checkout_url": (
                f"http://localhost/mock-pay"
                f"?ref={ref}&amount={amount_cents}&return={return_url}"
            ),
        }

    async def verify_webhook(
        self,
        payload: bytes,
        headers: dict,
    ) -> dict:
        """Parse webhook payload.

        Accepted JSON shape::

            {
                "provider_ref": "mock-<uuid>",
                "status": "paid" | "failed"
            }

        Raises ``ValueError`` if the payload is not valid JSON, fields are
        missing, or ``status`` is not a recognised value.
        """
        try:
            data = json.loads(payload)
        except Exception as exc:
            raise ValueError(f"Invalid JSON payload: {exc}") from exc

        if "provider_ref" not in data:
            raise ValueError("Missing 'provider_ref' in webhook payload")
        if "status" not in data:
            raise ValueError("Missing 'status' in webhook payload")
        if data["status"] not in ("paid", "failed"):
            raise ValueError(
                f"Invalid webhook status {data['status']!r}; "
                "expected 'paid' or 'failed'"
            )

        return {
            "status": data["status"],
            "provider_ref": data["provider_ref"],
        }

    async def refund(self, provider_ref: str, amount_cents: int | None = None) -> str:
        """Return a deterministic fake refund reference (WS4)."""
        return f"mock_refund_{provider_ref}"
