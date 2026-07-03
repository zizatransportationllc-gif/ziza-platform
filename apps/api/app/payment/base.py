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
        amount_cents: int,
        ref: str,
        return_url: str,
        notify_url: str | None = None,
        *,
        destination: str | None = None,
        application_fee_cents: int | None = None,
    ) -> dict:
        """Create a payment session with the upstream provider.

        Parameters
        ----------
        amount_cents:
            Total amount charged to the customer (USD cents).
        ref:
            Unique reference string (typically the intent UUID).
        return_url:
            URL the provider should redirect the customer to after payment.
        notify_url:
            Optional webhook/notify URL (used by some providers).
        destination:
            Connect connected-account id for a destination charge (Sprint 70).
            The payee's share is transferred there; ``None`` = no split.
        application_fee_cents:
            Amount the platform (Ziza) keeps when ``destination`` is set.

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
