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
import urllib.parse
import urllib.request
import uuid

from app.config import settings

_API_BASE = "https://api.stripe.com/v1"


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
