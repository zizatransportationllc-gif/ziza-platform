"""CinetPayAdapter — Sprint 41.

Production adapter for CinetPay (leader in West Africa / Ivory Coast).
Requires ``cinetpay_api_key`` and ``cinetpay_site_id`` settings.

Sprint 41: uses the CinetPay v2 JSON API (POST) instead of a hand-built
redirect URL.  The API returns a ``payment_url`` which the customer is
redirected to; the ``notify_url`` receives the webhook callback.

Docs: https://cinetpay.com/docs/api
"""
from __future__ import annotations

import hashlib
import hmac
import json


class CinetPayAdapter:
    """CinetPay payment adapter (Ivory Coast / West Africa)."""

    _provider_name = "cinetpay"
    _API_URL = "https://api-checkout.cinetpay.com/v2/payment"

    def __init__(self, api_key: str, site_id: str) -> None:
        self._api_key = api_key
        self._site_id = site_id

    async def create_checkout(
        self,
        amount_cents: int,
        ref: str,
        return_url: str,
        notify_url: str | None = None,
    ) -> dict:
        """Create a CinetPay payment session via the v2 JSON API.

        Posts to the CinetPay endpoint and returns the ``payment_url`` from
        the response so the customer can be redirected there.

        Returns ``{"provider_ref": ref, "checkout_url": payment_url}``.
        Raises ``RuntimeError`` if CinetPay rejects the request.
        """
        import httpx  # noqa: PLC0415

        if not notify_url:
            # Derive notify_url from return_url: swap /return → webhook path
            notify_url = return_url.replace("/payment/return", "/v1/payments/webhook")

        payload = {
            "apikey": self._api_key,
            "site_id": self._site_id,
            "transaction_id": ref,
            "amount": amount_cents,
            "currency": "XOF",
            "description": f"Ziza — ride {ref[:8]}",
            "return_url": return_url,
            "notify_url": notify_url,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(self._API_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()

        # CinetPay returns code "201" on success
        code = str(data.get("code", ""))
        if code != "201":
            msg = data.get("message") or data.get("description") or "unknown error"
            raise RuntimeError(f"CinetPay rejected the request: {msg} (code {code})")

        payment_url = data["data"]["payment_url"]
        return {
            "provider_ref": ref,
            "checkout_url": payment_url,
        }

    async def verify_webhook(
        self,
        payload: bytes,
        headers: dict,
    ) -> dict:
        """Verify CinetPay webhook signature and parse the event.

        CinetPay sends a ``X-CinetPay-Signature`` header containing the
        HMAC-SHA256 of the raw payload signed with the ``site_id``.

        Raises ``ValueError`` on invalid signature or malformed payload.
        """
        sig_header = headers.get("x-cinetpay-signature", "")
        expected = hmac.new(
            self._site_id.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(sig_header.lower(), expected.lower()):
            raise ValueError("Invalid CinetPay webhook signature")

        try:
            data = json.loads(payload)
        except Exception as exc:
            raise ValueError(f"Malformed webhook payload: {exc}") from exc

        # Map CinetPay statuses → normalised values
        cp_status = data.get("status", "").upper()
        status = "paid" if cp_status in ("ACCEPTED", "PAID") else "failed"

        return {
            "status": status,
            "provider_ref": data.get("transaction_id", ""),
        }
