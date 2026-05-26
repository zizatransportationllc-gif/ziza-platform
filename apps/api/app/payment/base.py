"""PaymentAdapter protocol — Sprint 24.

Any payment backend (mock, CinetPay, Stripe…) must satisfy this interface.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class PaymentAdapter(Protocol):
    """Contract every payment backend must satisfy."""

    async def create_checkout(
        self,
        amount_xof: int,
        ref: str,
        return_url: str,
    ) -> dict:
        """Create a payment session with the upstream provider.

        Parameters
        ----------
        amount_xof:
            Amount in XOF (West African CFA Franc).
        ref:
            Unique reference string (typically the intent UUID).
        return_url:
            URL the provider should redirect the customer to after payment.

        Returns
        -------
        dict with keys:
            ``provider_ref``  – opaque ID returned by the provider
            ``checkout_url``  – URL the customer must visit to pay
        """
        ...

    async def verify_webhook(
        self,
        payload: bytes,
        headers: dict,
    ) -> dict:
        """Verify and parse an inbound webhook from the payment provider.

        Parameters
        ----------
        payload:
            Raw request body bytes.
        headers:
            HTTP request headers (used for signature verification).

        Returns
        -------
        dict with keys:
            ``status``        – ``"paid"`` or ``"failed"``
            ``provider_ref``  – matches a previously created intent

        Raises
        ------
        ValueError
            If the signature is invalid or the payload is malformed.
        """
        ...
