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


def create_express_account(email: str | None) -> str:
    """Create a Stripe Connect Express account; return its account id."""
    if not _enabled():
        return f"acct_mock_{uuid.uuid4().hex[:16]}"
    acct = _post("/accounts", {
        "type": "express",
        "capabilities[transfers][requested]": "true",
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
