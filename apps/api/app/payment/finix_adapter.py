"""FinixAdapter — Stripe-Connect replacement (US marketplace acquiring + split).

Finix is a payment-facilitator platform: the customer pays through a **Payment
Link** (a Finix-hosted checkout page, the analog of a Stripe Checkout Session),
funds settle to a **Merchant** (the payee), and the platform keeps a ``fee`` on
the split — the analog of a Stripe Connect destination charge with an
``application_fee_amount``.

Model mapping (so this drops into the existing ``PaymentAdapter`` contract):

  Stripe                                  Finix
  ------------------------------------    ---------------------------------------
  Checkout Session (checkout_url)         Payment Link (link_url)
  transfer_data[destination]=acct_…       payment link's ``merchant_id`` = payee
  application_fee_amount                  ``fee`` retained by the platform
  refund (payment_intent)                 Transfer reversal (POST …/reversals)
  Stripe-Signature (HMAC)                 Basic-auth on the webhook + Finix-Signature

Auth: HTTP Basic (API user + password). Every request pins ``Finix-Version``.
Sandbox base: ``https://finix.sandbox-payments-api.com`` (prod overrides it).

⚠️ SANDBOX SCAFFOLD — three things to confirm against real sandbox payloads
before promoting to live (Finix's exact field names vary by product tier):
  1. ``fee`` placement on Payment Links vs. on the resulting Transfer.
  2. The webhook entity Finix emits on link completion (we key on the
     ``payment_link`` event so its ``id`` matches the stored ``provider_ref``;
     a transfer-only event falls back to the ``ziza_ref`` tag).
  3. The real Finix processing cost field read by ``get_actual_fee``.

Docs: https://docs.finix.com/api
"""
from __future__ import annotations

import base64
import hmac
import json
import urllib.request


class FinixAdapter:
    """Finix payment adapter (US marketplace, split via Payment Links)."""

    _provider_name = "finix"

    def __init__(
        self,
        *,
        api_base: str,
        username: str,
        password: str,
        version: str,
        platform_merchant_id: str,
        webhook_username: str,
        webhook_password: str,
    ) -> None:
        self._api_base = api_base.rstrip("/")
        self._username = username
        self._password = password
        self._version = version
        self._platform_merchant_id = platform_merchant_id
        self._webhook_username = webhook_username
        self._webhook_password = webhook_password

    # ------------------------------------------------------------------ helpers
    def _auth_header(self) -> str:
        token = base64.b64encode(f"{self._username}:{self._password}".encode()).decode()
        return f"Basic {token}"

    def _headers(self) -> dict:
        return {
            "Authorization": self._auth_header(),
            "Content-Type": "application/json",
            "Accept": "application/hal+json",
            "Finix-Version": self._version,
        }

    def _post(self, path: str, body: dict) -> dict:
        req = urllib.request.Request(
            f"{self._api_base}{path}",
            data=json.dumps(body).encode(),
            headers=self._headers(),
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())

    def _get(self, path: str) -> dict:
        req = urllib.request.Request(
            f"{self._api_base}{path}",
            headers=self._headers(),
            method="GET",
        )
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())

    # ------------------------------------------------------------------ checkout
    async def create_checkout(
        self,
        amount_cents: int,
        ref: str,
        return_url: str,
        notify_url: str | None = None,  # webhooks are configured in the Finix dashboard
        *,
        destination: str | None = None,
        application_fee_cents: int | None = None,
    ) -> dict:
        """Create a Finix Payment Link and return ``{provider_ref, checkout_url}``.

        For a marketplace split the buyer pays into the **payee's** Merchant
        (``destination``) and Ziza keeps ``application_fee_cents`` as the platform
        ``fee``. With no ``destination`` (e.g. a wallet top-up) the platform's own
        Merchant is the payee and no fee is split.
        """
        merchant_id = destination or self._platform_merchant_id
        if not merchant_id:
            raise RuntimeError(
                "No Finix merchant id for the charge "
                "(set finix_platform_merchant_id or pass a destination)"
            )
        body: dict = {
            "merchant_id": merchant_id,
            "payment_frequency": "ONE_TIME",
            "currency": "USD",
            "amount_details": {"amount": amount_cents, "currency": "USD"},
            "nickname": f"Ziza {ref}",
            # Correlate the eventual webhook back to our PaymentIntent.
            "tags": {"ziza_ref": ref},
            "success_return_url": return_url,
            "unsuccessful_return_url": return_url,
            "expired_session_url": return_url,
        }
        if application_fee_cents is not None:
            # Platform fee retained on the split (buyer → payee merchant, Ziza keeps fee).
            body["fee"] = application_fee_cents
        data = self._post("/payment_links", body)
        return {
            "provider_ref": data["id"],
            "checkout_url": data["link_url"],
        }

    # ------------------------------------------------------------------- webhook
    async def verify_webhook(self, payload: bytes, headers: dict) -> dict:
        """Verify the webhook's Basic-auth credentials and return normalised data.

        Finix (Authentication.type = BASIC) sends ``Authorization: Basic <b64>``
        on every webhook POST. We compare it in constant time against the
        credentials Ziza configured on the endpoint. Returns
        ``{"status": "paid"|"failed", "provider_ref": <payment_link_id>}``.

        Raises ``ValueError`` on bad credentials, malformed body, or an event
        we do not handle.
        """
        if not self._webhook_username or not self._webhook_password:
            raise ValueError("Finix webhook credentials not configured")
        token = base64.b64encode(
            f"{self._webhook_username}:{self._webhook_password}".encode()
        ).decode()
        expected = f"Basic {token}"
        if not hmac.compare_digest(headers.get("authorization", ""), expected):
            raise ValueError("Invalid Finix webhook Basic-auth credentials")

        try:
            event = json.loads(payload)
        except Exception as exc:
            raise ValueError(f"Malformed Finix webhook payload: {exc}") from exc

        embedded = event.get("_embedded") or {}

        # Primary signal: payment-link completion — its id == the stored provider_ref.
        links = embedded.get("payment_links") or []
        if links:
            link = links[0]
            state = (link.get("state") or link.get("status") or "").upper()
            link_id = link.get("id", "")
            if state in ("COMPLETED", "PAID", "SUCCEEDED"):
                return {"status": "paid", "provider_ref": link_id}
            if state in ("FAILED", "EXPIRED", "CANCELED", "CANCELLED"):
                return {"status": "failed", "provider_ref": link_id}
            raise ValueError(f"Unhandled Finix payment_link state: {state!r}")

        # Fallback: a transfer-only event — correlate via the payment link id if
        # Finix carried it, else the ziza_ref tag we set on the link.
        transfers = embedded.get("transfers") or []
        if transfers:
            tr = transfers[0]
            state = (tr.get("state") or "").upper()
            ref = tr.get("payment_link_id") or (tr.get("tags") or {}).get("ziza_ref", "")
            if state == "SUCCEEDED":
                return {"status": "paid", "provider_ref": ref}
            if state in ("FAILED", "CANCELED", "CANCELLED"):
                return {"status": "failed", "provider_ref": ref}
            raise ValueError(f"Unhandled Finix transfer state: {state!r}")

        raise ValueError("Unrecognized Finix webhook entity")

    # -------------------------------------------------------------------- refund
    async def refund(self, provider_ref: str, amount_cents: int | None = None) -> str:
        """Refund a payment. ``provider_ref`` is the Payment Link id, so we first
        resolve its settled Transfer, then create an (idempotent) reversal."""
        link = self._get(f"/payment_links/{provider_ref}")
        transfers = (link.get("_embedded") or {}).get("transfers") or []
        transfer_id = transfers[0]["id"] if transfers else link.get("transfer_id")
        if not transfer_id:
            raise RuntimeError("No settled Finix transfer to refund for this payment link")
        body: dict = {"idempotency_id": f"refund_{provider_ref}"}
        if amount_cents:
            body["refund_amount"] = amount_cents
        reversal = self._post(f"/transfers/{transfer_id}/reversals", body)
        return reversal["id"]

    # ---------------------------------------------------------------- actual fee
    async def get_actual_fee(self, provider_ref: str) -> int | None:
        """Best-effort real processing cost (USD cents) for reconciliation.

        ``provider_ref`` is the Payment Link id → resolve its Transfer → read the
        Finix fee. Returns ``None`` if it cannot be resolved (reconciliation then
        assumes no drift), matching the Stripe adapter's contract.
        """
        try:
            link = self._get(f"/payment_links/{provider_ref}")
            transfers = (link.get("_embedded") or {}).get("transfers") or []
            if not transfers:
                return None
            fee = transfers[0].get("fee")
            return int(fee) if fee is not None else None
        except Exception:  # noqa: BLE001 — reconciliation tolerates missing data
            return None
