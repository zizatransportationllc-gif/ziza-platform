"""Stripe saved cards — Sprint 73.

Stores a user's payment methods on a Stripe **Customer** so rides can be
authorized (a hold) when a driver accepts and captured at completion, off
session. Cards are collected **client-side** via Stripe Elements (web) / the
Stripe SDK (mobile) — Ziza never handles raw card numbers; the backend only
ever sees a PaymentMethod id (``pm_…``) plus the brand and last 4 digits.

In dev / CI (no ``stripe_secret_key``) deterministic fakes are returned so the
flow can run without touching Stripe.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
import uuid

from app.config import settings

_API_BASE = "https://api.stripe.com/v1"


def _safe_json(exc: urllib.error.HTTPError) -> dict:
    try:
        return json.loads(exc.read())
    except Exception:  # noqa: BLE001
        return {}


def _enabled() -> bool:
    return bool(settings.stripe_secret_key)


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.stripe_secret_key}",
        "Content-Type": "application/x-www-form-urlencoded",
    }


def _post(path: str, fields: dict) -> dict:
    data = urllib.parse.urlencode(fields, doseq=True).encode()
    req = urllib.request.Request(f"{_API_BASE}{path}", data=data, headers=_headers())
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def _get(path: str) -> dict:
    req = urllib.request.Request(
        f"{_API_BASE}{path}",
        headers={"Authorization": f"Bearer {settings.stripe_secret_key}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def create_customer(email: str | None, name: str | None) -> str:
    """Create a Stripe Customer; return its id. Email/name identify the payer."""
    if not _enabled():
        return f"cus_mock_{uuid.uuid4().hex[:16]}"
    fields = {}
    if email:
        fields["email"] = email
    if name:
        fields["name"] = name
    return _post("/customers", fields)["id"]


def create_setup_intent(customer_id: str) -> dict:
    """Return ``{id, client_secret}`` for a SetupIntent the client confirms to
    save a card. ``usage=off_session`` so the saved card can later be charged
    without the customer present (the hold at driver-accept)."""
    if not _enabled():
        h = uuid.uuid4().hex
        return {"id": f"seti_mock_{h[:12]}", "client_secret": f"seti_mock_{h[:12]}_secret_{h[12:24]}"}
    si = _post("/setup_intents", {
        "customer": customer_id,
        "payment_method_types[]": "card",
        "usage": "off_session",
    })
    return {"id": si["id"], "client_secret": si["client_secret"]}


def get_default_payment_method(customer_id: str) -> str | None:
    """The customer's default PaymentMethod id (used for the ride hold), or None."""
    if not _enabled():
        return None
    try:
        cust = _get(f"/customers/{customer_id}")
    except Exception:  # noqa: BLE001
        return None
    return (cust.get("invoice_settings") or {}).get("default_payment_method")


def set_default_payment_method(customer_id: str, pm_id: str) -> None:
    if not _enabled():
        return
    _post(f"/customers/{customer_id}", {"invoice_settings[default_payment_method]": pm_id})


def list_payment_methods(customer_id: str, default_pm: str | None = None) -> list[dict]:
    """Return the customer's saved cards as ``{id, brand, last4, exp_month,
    exp_year, is_default}``."""
    if not _enabled():
        return []
    data = _get(f"/customers/{customer_id}/payment_methods?type=card")
    out = []
    for pm in data.get("data", []):
        card = pm.get("card") or {}
        out.append({
            "id": pm["id"],
            "brand": card.get("brand"),
            "last4": card.get("last4"),
            "exp_month": card.get("exp_month"),
            "exp_year": card.get("exp_year"),
            "is_default": pm["id"] == default_pm,
        })
    return out


def detach_payment_method(pm_id: str) -> None:
    """Remove a saved card from its customer."""
    if not _enabled():
        return
    _post(f"/payment_methods/{pm_id}/detach", {})


# ---------------------------------------------------------------------------
# Ride payments — authorize (hold) at driver-accept, capture at completion
# ---------------------------------------------------------------------------

def create_ride_authorization(
    customer_id: str,
    payment_method_id: str,
    amount_cents: int,
    ref: str,
    *,
    destination: str | None = None,
    application_fee_cents: int | None = None,
) -> dict:
    """Place a hold on the saved card — a manual-capture, off-session
    PaymentIntent with the Connect split. Returns ``{id, status, error_code?,
    decline_code?}``. ``status == 'requires_capture'`` means the hold succeeded.
    Any Stripe error (declined, authentication_required, …) returns
    ``status == 'failed'`` rather than raising — the caller notifies the payer.
    """
    if not _enabled():
        return {"id": f"pi_mock_{uuid.uuid4().hex[:16]}", "status": "requires_capture"}
    fields = {
        "amount": amount_cents,
        "currency": "usd",
        "customer": customer_id,
        "payment_method": payment_method_id,
        "capture_method": "manual",
        "confirm": "true",
        "off_session": "true",
        "metadata[ziza_ref]": ref,
    }
    if destination is not None:
        fields["transfer_data[destination]"] = destination
    if application_fee_cents is not None:
        fields["application_fee_amount"] = application_fee_cents
    try:
        pi = _post("/payment_intents", fields)
        return {"id": pi.get("id"), "status": pi.get("status")}
    except urllib.error.HTTPError as exc:
        err = _safe_json(exc).get("error", {})
        return {
            "id": (err.get("payment_intent") or {}).get("id"),
            "status": "failed",
            "error_code": err.get("code"),
            "decline_code": err.get("decline_code"),
        }


def capture_ride_payment(payment_intent_id: str, amount_cents: int | None = None) -> dict:
    """Capture a previously authorized ride payment. ``amount_cents`` (≤ the
    authorized amount) captures the final fare; None captures the full hold."""
    if not _enabled():
        return {"status": "succeeded"}
    fields = {}
    if amount_cents is not None:
        fields["amount_to_capture"] = amount_cents
    pi = _post(f"/payment_intents/{payment_intent_id}/capture", fields)
    return {"status": pi.get("status")}


def cancel_ride_authorization(payment_intent_id: str) -> dict:
    """Release a hold (e.g. the ride was cancelled) — void the PaymentIntent."""
    if not _enabled():
        return {"status": "canceled"}
    try:
        pi = _post(f"/payment_intents/{payment_intent_id}/cancel", {})
        return {"status": pi.get("status")}
    except urllib.error.HTTPError as exc:
        return {"status": "failed", "error": _safe_json(exc).get("error", {}).get("code")}


def create_hold_intent(
    customer_id: str,
    amount_cents: int,
    ref: str,
    *,
    destination: str | None = None,
    application_fee_cents: int | None = None,
) -> dict:
    """Create a manual-capture PaymentIntent the customer confirms **on-session**
    (Stripe Payment Sheet / Elements), returning ``{id, client_secret, status}``.

    Unlike ``create_ride_authorization`` this does NOT confirm off-session — the
    client validates the hold in Stripe's UI, then the caller captures later.
    In dev/CI (no key) returns a mock id + client_secret.
    """
    if not _enabled():
        pid = f"pi_mock_{uuid.uuid4().hex[:16]}"
        return {"id": pid, "client_secret": f"{pid}_secret_mock", "status": "requires_payment_method"}
    fields = {
        "amount": amount_cents,
        "currency": "usd",
        "customer": customer_id,
        "capture_method": "manual",
        "automatic_payment_methods[enabled]": "true",
        "metadata[ziza_ref]": ref,
    }
    if destination is not None:
        fields["transfer_data[destination]"] = destination
    if application_fee_cents is not None:
        fields["application_fee_amount"] = application_fee_cents
    pi = _post("/payment_intents", fields)
    return {"id": pi.get("id"), "client_secret": pi.get("client_secret"), "status": pi.get("status")}


def charge_saved_card(
    customer_id: str,
    payment_method_id: str,
    amount_cents: int,
    ref: str,
    *,
    destination: str | None = None,
    application_fee_cents: int | None = None,
) -> dict:
    """Charge the saved card **immediately** (automatic capture) off-session, with
    the Connect split. Used for charge-at-completion (no prior hold): the craft
    amount is captured in one step when the professional marks the work done.

    Returns ``{id, status, error_code?, decline_code?}``; ``status == 'succeeded'``
    means the money was captured. Any Stripe error (declined, authentication
    required, …) returns ``status == 'failed'`` rather than raising. In dev/CI
    (no key) returns a mock succeeded charge.
    """
    if not _enabled():
        return {"id": f"pi_mock_{uuid.uuid4().hex[:16]}", "status": "succeeded"}
    fields = {
        "amount": amount_cents,
        "currency": "usd",
        "customer": customer_id,
        "payment_method": payment_method_id,
        "confirm": "true",
        "off_session": "true",
        "metadata[ziza_ref]": ref,
    }
    if destination is not None:
        fields["transfer_data[destination]"] = destination
    if application_fee_cents is not None:
        fields["application_fee_amount"] = application_fee_cents
    try:
        pi = _post("/payment_intents", fields)
        return {"id": pi.get("id"), "status": pi.get("status")}
    except urllib.error.HTTPError as exc:
        err = _safe_json(exc).get("error", {})
        return {
            "id": (err.get("payment_intent") or {}).get("id"),
            "status": "failed",
            "error_code": err.get("code"),
            "decline_code": err.get("decline_code"),
        }


def get_intent_status(payment_intent_id: str) -> str | None:
    """Return a PaymentIntent's current status (e.g. ``requires_capture``), or None.

    In dev/CI (no key) returns ``requires_capture`` — the mock hold is treated as
    validated so the flow can proceed."""
    if not _enabled():
        return "requires_capture"
    try:
        pi = _get(f"/payment_intents/{payment_intent_id}")
        return pi.get("status")
    except Exception:  # noqa: BLE001 — unknown/transient → let the caller decide
        return None
