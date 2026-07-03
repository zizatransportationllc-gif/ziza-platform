"""Stripe Issuing — Sprint 70 (WS-Issuing).

Issues a virtual/physical **debit card** to a driver / professional so they can
spend the balance they accumulate in their Stripe Connect account (from the
split-at-charge destination charges).

In dev / CI (no ``stripe_secret_key``) deterministic fakes are returned so the
whole flow can run without touching Stripe.

Cards are issued on the payee's connected account (``account_id`` → passed as the
``Stripe-Account`` header). Confirm the exact Issuing-on-Connect setup with
Stripe before going live (see docs/go-live).
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


def _headers(account_id: str | None) -> dict:
    h = {
        "Authorization": f"Bearer {settings.stripe_secret_key}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    if account_id:
        h["Stripe-Account"] = account_id
    return h


def _post(path: str, fields: dict, account_id: str | None = None) -> dict:
    data = urllib.parse.urlencode(fields, doseq=True).encode()
    req = urllib.request.Request(f"{_API_BASE}{path}", data=data, headers=_headers(account_id))
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def _get(path: str, account_id: str | None = None) -> dict:
    req = urllib.request.Request(f"{_API_BASE}{path}", headers=_headers(account_id))
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def create_cardholder(name: str, email: str | None, account_id: str | None = None) -> str:
    """Create an Issuing cardholder; return its id."""
    if not _enabled():
        return f"ich_mock_{uuid.uuid4().hex[:16]}"
    fields = {
        "type": "individual",
        "name": name or "ZIZA Payee",
        **({"email": email} if email else {}),
        # Minimal US billing address; the real value comes from KYC/onboarding.
        "billing[address][line1]": "N/A",
        "billing[address][city]": "Newark",
        "billing[address][state]": "NJ",
        "billing[address][postal_code]": "07102",
        "billing[address][country]": "US",
    }
    return _post("/issuing/cardholders", fields, account_id)["id"]


def create_card(cardholder_id: str, account_id: str | None = None) -> dict:
    """Create a virtual debit card for a cardholder; return ``{card_id, last4}``."""
    if not _enabled():
        h = uuid.uuid4().hex
        return {"card_id": f"ic_mock_{h[:16]}", "last4": f"{int(h[:4], 16) % 10000:04d}"}
    card = _post("/issuing/cards", {
        "cardholder": cardholder_id,
        "currency": "usd",
        "type": "virtual",
    }, account_id)
    return {"card_id": card["id"], "last4": card.get("last4", "")}


def get_card(card_id: str, account_id: str | None = None) -> dict:
    """Return ``{status, last4}`` for a card."""
    if not _enabled():
        return {"status": "active", "last4": ""}
    card = _get(f"/issuing/cards/{card_id}", account_id)
    return {"status": card.get("status", ""), "last4": card.get("last4", "")}


def set_card_status(card_id: str, active: bool, account_id: str | None = None) -> dict:
    """Activate or freeze a card; return ``{status}``."""
    new_status = "active" if active else "inactive"
    if not _enabled():
        return {"status": new_status}
    card = _post(f"/issuing/cards/{card_id}", {"status": new_status}, account_id)
    return {"status": card.get("status", new_status)}
