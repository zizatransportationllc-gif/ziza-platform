"""CinetPayAdapter — Sprint 24.

Production adapter for CinetPay (leader in West Africa / Ivory Coast).
Requires ``cinetpay_api_key`` and ``cinetpay_site_id`` settings.

Docs: https://cinetpay.com/docs/api
"""
from __future__ import annotations

import hashlib
import hmac
import json


class CinetPayAdapter:
    """CinetPay payment adapter (Ivory Coast / West Africa)."""

    _provider_name = "cinetpay"
    _CHECKOUT_URL = "https://api-checkout.cinetpay.com/v2/payment"

    def __init__(self, api_key: str, site_id: str) -> None:
        self._api_key = api_key
        self._site_id = site_id

    async def create_checkout(
        self,
        amount_xof: int,
        ref: str,
        return_url: str,
    ) -> dict:
        """Create a CinetPay payment session.

        Returns ``{"provider_ref": ref, "checkout_url": url}``.
        The ``checkout_url`` embeds the payment parameters as query params;
        the customer is redirected there to complete the transaction.
        """
        # Build the signed payment URL (CinetPay cashier format v2).
        params = {
            "apikey": self._api_key,
            "site_id": self._site_id,
            "transaction_id": ref,
            "amount": amount_xof,
            "currency": "XOF",
            "return_url": return_url,
            "notify_url": return_url.replace("/return", "/webhook"),
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        checkout_url = f"{self._CHECKOUT_URL}?{query}"
        return {
            "provider_ref": ref,
            "checkout_url": checkout_url,
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
