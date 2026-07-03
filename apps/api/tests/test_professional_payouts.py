"""Sprint 67 — Professional payout requests (balance-capped).

Covers:
  GET  /v1/craft/professionals/me/balance
  POST /v1/craft/professionals/me/payout-requests
  GET  /v1/craft/professionals/me/payout-requests

A professional accrues earnings when a customer selects (accepts) one of their
bids. Withdrawals are capped at the available balance (gains − non-rejected
payouts).
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register_pro(email: str = "professional@ziza.dev") -> str:
    tok = _tok(email)
    client.post("/v1/auth/register", headers=_h(tok))
    r = client.post(
        "/v1/craft/professionals/register",
        headers=_h(tok),
        json={"specialties": "tow"},
    )
    assert r.status_code in (200, 201), r.text
    return tok


def _setup_pro_with_earnings(price_cents: int = 50_000) -> str:
    """Register a pro and have a customer accept their bid → gains = price_cents."""
    p_tok = _register_pro()
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))

    req = client.post("/v1/craft/requests", headers=_h(c_tok), json={
        "category": "tow", "description": "Flat tyre on the highway",
        "lat": 5.3207, "lng": -4.0175,
    })
    assert req.status_code == 201, req.text
    rid = req.json()["request_id"]

    bid = client.post(f"/v1/craft/requests/{rid}/bids", headers=_h(p_tok), json={
        "price_cents": price_cents, "eta_min": 20,
    })
    assert bid.status_code == 201, bid.text
    bid_id = bid.json()["bid_id"]

    sel = client.post(f"/v1/craft/requests/{rid}/select", headers=_h(c_tok), json={
        "bid_id": bid_id,
    })
    assert sel.status_code == 200, sel.text
    return p_tok


def _balance(tok: str) -> dict:
    r = client.get("/v1/craft/professionals/me/balance", headers=_h(tok))
    assert r.status_code == 200, r.text
    return r.json()


def _create_payout(tok: str, amount_cents: int):
    return client.post(
        "/v1/craft/professionals/me/payout-requests",
        headers=_h(tok),
        json={"amount_cents": amount_cents},
    )


# ---------------------------------------------------------------------------
# Balance
# ---------------------------------------------------------------------------

def test_pro_balance_reflects_accepted_bid():
    """Available balance equals the accepted bid price when no payouts yet."""
    tok = _setup_pro_with_earnings(50_000)
    data = _balance(tok)
    assert data["gains_cents"] == 50_000
    assert data["retraits_cents"] == 0
    assert data["disponible_cents"] == 50_000
    assert "professional_id" in data


def test_pro_balance_zero_without_earnings():
    """A freshly registered pro has zero available balance."""
    tok = _register_pro()
    data = _balance(tok)
    assert data["disponible_cents"] == 0


def test_pro_balance_exposes_connect_balance():
    """Sprint 70 — the pro balance exposes their Stripe Connect balance (money
    received from split-at-charge destination charges). Zero in dev/CI."""
    tok = _register_pro()
    data = _balance(tok)
    assert data["connect_available_cents"] == 0
    assert data["connect_pending_cents"] == 0


def test_pro_balance_requires_pro_role():
    """A driver cannot read the professional balance — 403."""
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    r = client.get("/v1/craft/professionals/me/balance", headers=_h(tok))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Creation
# ---------------------------------------------------------------------------

def test_pro_create_payout_within_balance():
    """Pro withdraws within balance — 201, shape correct, balance drops."""
    tok = _setup_pro_with_earnings(50_000)
    r = _create_payout(tok, 20_000)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["amount_cents"] == 20_000
    assert data["status"] == "pending"
    # The pending payout is committed against the balance.
    assert _balance(tok)["disponible_cents"] == 30_000


def test_pro_create_payout_exceeds_balance_returns_422():
    """Requesting more than the available balance is rejected."""
    tok = _setup_pro_with_earnings(50_000)
    r = _create_payout(tok, 50_001)
    assert r.status_code == 422


def test_pro_pending_payouts_reduce_available():
    """Two pending payouts cannot together exceed the balance."""
    tok = _setup_pro_with_earnings(50_000)
    assert _create_payout(tok, 40_000).status_code == 201
    # Only 10_000 remains available now.
    assert _create_payout(tok, 20_000).status_code == 422
    assert _create_payout(tok, 10_000).status_code == 201


def test_pro_create_payout_zero_returns_422():
    """Amount must be >= 1 — Pydantic rejects 0."""
    tok = _setup_pro_with_earnings(10_000)
    r = _create_payout(tok, 0)
    assert r.status_code == 422


def test_pro_create_payout_requires_pro_role():
    """A customer cannot create professional payout requests — 403."""
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    r = _create_payout(tok, 1_000)
    assert r.status_code == 403


def test_pro_create_payout_requires_auth():
    """Unauthenticated request returns 401."""
    r = client.post(
        "/v1/craft/professionals/me/payout-requests",
        json={"amount_cents": 1_000},
    )
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

def test_pro_list_payout_requests():
    """Pro lists their payout requests; list contains one just created."""
    tok = _setup_pro_with_earnings(50_000)
    _create_payout(tok, 15_000)
    r = client.get("/v1/craft/professionals/me/payout-requests", headers=_h(tok))
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert 15_000 in [p["amount_cents"] for p in data]


def test_pro_list_payout_requires_auth():
    """Unauthenticated list request returns 401."""
    r = client.get("/v1/craft/professionals/me/payout-requests")
    assert r.status_code == 401
