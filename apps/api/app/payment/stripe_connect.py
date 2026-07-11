"""Stripe Connect onboarding — WS3 (Sprint 68).

Drivers / professionals are paid through a Stripe Connect **Express** account.
This module creates the connected account, the hosted onboarding link, and reads
the account's status (whether payouts are enabled).

In dev / CI (no ``stripe_secret_key``) deterministic fakes are returned so the
whole flow — onboarding + payout batch — can run without touching Stripe.
"""
from __future__ import annotations

import json
import urllib.error
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
    fields = {
        "country": "US",
        # Custom-equivalent controller configuration (no Stripe-hosted dashboard;
        # platform collects requirements and owns payment losses).
        "controller[stripe_dashboard][type]": "none",
        "controller[fees][payer]": "application",
        "controller[losses][payments]": "application",
        "controller[requirement_collection]": "application",
        # `transfers` is all that's needed to receive the split via destination
        # charges — request it unconditionally.
        "capabilities[transfers][requested]": "true",
        **({"email": email} if email else {}),
    }
    # `card_issuing` can ONLY be requested once the platform itself is onboarded
    # on Stripe Issuing; otherwise Stripe rejects the whole account creation with
    # a 400 (requested_capabilities), breaking onboarding. Gate it behind config.
    if settings.stripe_issuing_enabled:
        fields["capabilities[card_issuing][requested]"] = "true"
    acct = _post("/accounts", fields)
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


def account_exists(account_id: str) -> bool:
    """Whether Stripe still recognizes ``account_id``.

    Used to detect **stale** connected-account ids so onboarding can re-provision:
    a mock id (``acct_mock_…``) persisted before Stripe went live in this env, or
    a pre-Custom Express account. In dev/CI (no key) every id is treated as valid.

    Only a definitive *"no such account"* (HTTP 400/404 ``resource_missing``)
    returns ``False``; transient/auth/5xx errors return ``True`` so a real account
    id is never discarded because of a network blip.
    """
    if not _enabled():
        return True
    if not account_id:
        return False
    try:
        _get(f"/accounts/{account_id}")
        return True
    except urllib.error.HTTPError as exc:
        # A bare account GET can only 400/404 because the id doesn't exist.
        return exc.code not in (400, 404)
    except Exception:  # noqa: BLE001 — transient error → keep the id, don't re-provision
        return True


def get_account_status(account_id: str) -> dict:
    """Return ``{payouts_enabled, charges_enabled, details_submitted,
    card_issuing_active}``.

    ``card_issuing_active`` reflects the connected account's ``card_issuing``
    capability being ``active`` (required before a card can be issued on it).

    A stale/invalid id or a transient Stripe error yields an all-``False`` status
    rather than raising, so callers (e.g. the payee's status endpoint) degrade
    gracefully instead of 500-ing.
    """
    if not _enabled():
        # Dev/CI: treat the mock account as fully onboarded so the flow can run.
        return {
            "payouts_enabled": True, "charges_enabled": True,
            "details_submitted": True, "card_issuing_active": True,
        }
    try:
        acct = _get(f"/accounts/{account_id}")
    except Exception:  # noqa: BLE001 — stale/invalid id or transient error → not ready
        return {
            "payouts_enabled": False, "charges_enabled": False,
            "details_submitted": False, "card_issuing_active": False,
        }
    caps = acct.get("capabilities") or {}
    return {
        "payouts_enabled": bool(acct.get("payouts_enabled")),
        "charges_enabled": bool(acct.get("charges_enabled")),
        "details_submitted": bool(acct.get("details_submitted")),
        "card_issuing_active": caps.get("card_issuing") == "active",
    }


def get_individual_address(account_id: str) -> dict | None:
    """Return the connected account's individual billing address (collected by
    Stripe during hosted onboarding), or ``None``.

    Used to populate the Issuing cardholder's billing address from real KYC data
    instead of a placeholder. Returns ``None`` in dev/CI (no key), when the
    account has no id, on any Stripe error, or when no ``line1`` is on file yet.
    """
    if not _enabled() or not account_id:
        return None
    try:
        acct = _get(f"/accounts/{account_id}")
    except Exception:  # noqa: BLE001 — no address available → caller falls back
        return None
    addr = (acct.get("individual") or {}).get("address") or {}
    if not addr.get("line1"):
        return None
    return {
        "line1": addr.get("line1"),
        "line2": addr.get("line2"),
        "city": addr.get("city"),
        "state": addr.get("state"),
        "postal_code": addr.get("postal_code"),
        "country": addr.get("country") or "US",
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
