"""Finix payee onboarding — Stripe-Connect (``stripe_connect.py``) replacement.

Drivers / professionals are paid through a Finix **Merchant**. This module mirrors
``stripe_connect``'s public API one-for-one so the two are interchangeable behind
``app.payment.connect.get_connect()`` — the same crud onboarding flow (create
account → hosted link → poll status → read balance) works for either provider,
for both the driver and the professional roles.

Finix mapping:
  - ``create_connected_account`` → create an **Identity** then provision a
    **Merchant** on it; return the merchant id (stored in ``stripe_account_id``).
  - ``create_account_link``       → a hosted **Onboarding Form** link for KYC/bank.
  - ``get_account_status``        → merchant ``processing_enabled`` /
    ``settlement_enabled`` / ``onboarding_state`` mapped onto Stripe's shape.
  - ``get_balance``               → payee's settled Finix balance (USD cents).
  - ``get_individual_address``    → ``None`` (Stripe Issuing is not offered on Finix).

In dev / CI (no ``finix_username``) deterministic fakes are returned so the whole
onboarding + payout flow runs without touching Finix.

⚠️ SANDBOX SCAFFOLD — confirm against real sandbox payloads before go-live:
  1. The ``processor`` value for merchant provisioning (sandbox vs live).
  2. Onboarding-Form association to an existing identity + the ``link_url`` field.
  3. Merchant status field names and the settled-balance source (Settlements).

Docs: https://docs.finix.com/guides/platform-payments/onboarding-sellers
"""
from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request
import uuid

from app.config import settings

# Sandbox test processor; live merchants are provisioned on the real processor.
_PROCESSOR = "DUMMY_V1"


def _enabled() -> bool:
    return bool(settings.finix_username and settings.finix_password)


def _headers() -> dict:
    token = base64.b64encode(
        f"{settings.finix_username}:{settings.finix_password}".encode()
    ).decode()
    return {
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json",
        "Accept": "application/hal+json",
        "Finix-Version": settings.finix_version,
    }


def _base() -> str:
    return settings.finix_api_base.rstrip("/")


def _post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        f"{_base()}{path}", data=json.dumps(body).encode(),
        headers=_headers(), method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def _get(path: str) -> dict:
    req = urllib.request.Request(f"{_base()}{path}", headers=_headers(), method="GET")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def create_connected_account(email: str | None) -> str:
    """Create a Finix Identity + Merchant; return the **merchant id**.

    The merchant starts un-approved (``onboarding_state`` PROVISIONING); KYC/bank
    details are collected through the hosted onboarding link (below). In dev/CI a
    deterministic fake id is returned.
    """
    if not _enabled():
        return f"MU_mock_{uuid.uuid4().hex[:16]}"
    identity = _post("/identities", {
        "entity": {"email": email} if email else {},
        "tags": {"platform": "ziza"},
    })
    merchant = _post(f"/identities/{identity['id']}/merchants", {"processor": _PROCESSOR})
    return merchant["id"]


def create_account_link(account_id: str, return_url: str, refresh_url: str) -> str:
    """Create a hosted Onboarding Form link the payee visits to complete KYC/bank.

    ``account_id`` is the merchant id; we resolve its identity and open a form
    scoped to it. In dev/CI a deterministic fake URL is returned.
    """
    if not _enabled():
        return f"https://onboarding.finix.com/mock/{account_id}"
    merchant = _get(f"/merchants/{account_id}")
    identity_id = merchant.get("identity")
    form = _post("/onboarding_forms", {
        "identity": identity_id,
        "return_url": return_url,
        "expired_session_url": refresh_url,
        "fee_details_url": return_url,
        "terms_of_service_url": return_url,
        "onboarding_data": {},
    })
    link = form.get("onboarding_link") or {}
    return link.get("link_url", "")


def account_exists(account_id: str) -> bool:
    """Whether Finix still recognizes ``account_id`` (detects stale/mock ids so
    onboarding can re-provision). In dev/CI every id is treated as valid."""
    if not _enabled():
        return True
    if not account_id:
        return False
    try:
        _get(f"/merchants/{account_id}")
        return True
    except urllib.error.HTTPError as exc:
        if exc.code in (400, 403, 404):
            return False
        return True
    except Exception:  # noqa: BLE001 — transient error → keep the id
        return True


def get_account_status(account_id: str) -> dict:
    """Return ``{payouts_enabled, charges_enabled, details_submitted,
    card_issuing_active}`` — the same shape ``stripe_connect`` returns.

    Maps Finix merchant flags: ``settlement_enabled`` → payouts,
    ``processing_enabled`` → charges, ``onboarding_state == APPROVED`` → details.
    ``card_issuing_active`` is always ``False`` (Issuing is Stripe-only). A
    stale/invalid id or transient error yields all-``False`` rather than raising.
    """
    if not _enabled():
        return {
            "payouts_enabled": True, "charges_enabled": True,
            "details_submitted": True, "card_issuing_active": False,
        }
    try:
        m = _get(f"/merchants/{account_id}")
    except Exception:  # noqa: BLE001 — stale id or transient error → not ready
        return {
            "payouts_enabled": False, "charges_enabled": False,
            "details_submitted": False, "card_issuing_active": False,
        }
    return {
        "payouts_enabled": bool(m.get("settlement_enabled")),
        "charges_enabled": bool(m.get("processing_enabled")),
        "details_submitted": (m.get("onboarding_state") or "").upper() == "APPROVED",
        "card_issuing_active": False,
    }


def get_individual_address(account_id: str) -> dict | None:
    """Stripe Issuing is not offered on Finix — no cardholder address to surface."""
    return None


def get_balance(account_id: str) -> dict:
    """Return the payee's settled Finix balance in USD cents.

    ``{"available_cents": <int>, "pending_cents": <int>}``. In dev/CI (or when the
    id is empty) returns zeros. SANDBOX SCAFFOLD: Finix exposes settled funds via
    Settlements — wire the real sum before go-live; zeros here never over-report.
    """
    if not _enabled() or not account_id:
        return {"available_cents": 0, "pending_cents": 0}
    try:
        # Placeholder: real available balance is the sum of the merchant's
        # unfunded Settlement totals — confirm the Settlements query before live.
        _get(f"/merchants/{account_id}")
    except Exception:  # noqa: BLE001 — surface an empty balance rather than 500
        return {"available_cents": 0, "pending_cents": 0}
    return {"available_cents": 0, "pending_cents": 0}
