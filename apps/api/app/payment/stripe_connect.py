"""Stripe Connect onboarding — WS3 (Sprint 68).

Drivers / professionals are paid through a Stripe Connect **Express** account.
This module creates the connected account, the hosted onboarding link, and reads
the account's status (whether payouts are enabled).

In dev / CI (no ``stripe_secret_key``) deterministic fakes are returned so the
whole flow — onboarding + payout batch — can run without touching Stripe.
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


def _post(path: str, fields: dict) -> dict:
    data = urllib.parse.urlencode(fields, doseq=True).encode()
    req = urllib.request.Request(
        f"{_API_BASE}{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {settings.stripe_secret_key}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def _get(path: str) -> dict:
    req = urllib.request.Request(
        f"{_API_BASE}{path}",
        headers={"Authorization": f"Bearer {settings.stripe_secret_key}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def create_connected_account(email: str | None) -> str:
    """Create a Stripe Connect **Custom** connected account; return its id.

    Sprint 71 — Custom (platform-controlled) accounts are **required** for Stripe
    Issuing (the payee's debit card is issued on this account). Express accounts
    cannot use Issuing. With Custom, the platform (Ziza) owns requirement
    collection and **loss liability** (the ``controller.*`` fields below); Stripe
    still performs the actual KYC, surfaced through the hosted onboarding link.

    Capabilities requested:
      - ``transfers``   → receive the split via destination charges.
      - ``card_issuing`` → issue the debit card.

    NB: making the card *spendable* additionally requires funding the account's
    separate **Issuing balance** from its main balance — tracked as a follow-up
    (see docs/plans backlog); this function only sets the account up correctly.
    """
    if not _enabled():
        return f"acct_mock_{uuid.uuid4().hex[:16]}"
    acct = _post("/accounts", {
        "country": "US",
        # Custom-equivalent controller configuration (no Stripe-hosted dashboard;
        # platform collects requirements and owns payment losses).
        "controller[stripe_dashboard][type]": "none",
        "controller[fees][payer]": "application",
        "controller[losses][payments]": "application",
        "controller[requirement_collection]": "application",
        "capabilities[transfers][requested]": "true",
        "capabilities[card_issuing][requested]": "true",
        **({"email": email} if email else {}),
    })
    return acct["id"]


def create_account_link(account_id: str, return_url: str, refresh_url: str) -> str:
    """Create a hosted onboarding link the payee visits to complete KYC/bank info."""
    if not _enabled():
        return f"https://connect.stripe.com/mock-onboarding/{account_id}"
    link = _post("/account_links", {
        "account": account_id,
        "return_url": return_url,
        "refresh_url": refresh_url,
        "type": "account_onboarding",
    })
    return link["url"]


def get_account_status(account_id: str) -> dict:
    """Return ``{payouts_enabled, charges_enabled, details_submitted}``."""
    if not _enabled():
        # Dev/CI: treat the mock account as fully onboarded so payouts can run.
        return {"payouts_enabled": True, "charges_enabled": True, "details_submitted": True}
    acct = _get(f"/accounts/{account_id}")
    return {
        "payouts_enabled": bool(acct.get("payouts_enabled")),
        "charges_enabled": bool(acct.get("charges_enabled")),
        "details_submitted": bool(acct.get("details_submitted")),
    }


def _sum_balance_usd(entries: list) -> int:
    """Sum USD ``amount`` (cents) across a Stripe balance list, ignoring other
    currencies."""
    return sum(
        int(e.get("amount", 0))
        for e in (entries or [])
        if (e.get("currency") or "usd").lower() == "usd"
    )


def get_balance(account_id: str) -> dict:
    """Return the connected account's Stripe balance in USD cents.

    ``{"available_cents": <int>, "pending_cents": <int>}`` — the money the payee
    has received (from destination charges) that is available or still pending in
    their Connect account. In dev/CI (no ``stripe_secret_key``) returns zeros.
    """
    if not _enabled() or not account_id:
        return {"available_cents": 0, "pending_cents": 0}
    req = urllib.request.Request(
        f"{_API_BASE}/balance",
        headers={
            "Authorization": f"Bearer {settings.stripe_secret_key}",
            "Stripe-Account": account_id,
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            bal = json.loads(resp.read())
    except Exception:  # noqa: BLE001 — surface an empty balance rather than 500
        return {"available_cents": 0, "pending_cents": 0}
    return {
        "available_cents": _sum_balance_usd(bal.get("available")),
        "pending_cents": _sum_balance_usd(bal.get("pending")),
    }
