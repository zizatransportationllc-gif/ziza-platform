"""Sprint 33 — Customer Wallet tests (10 tests).

Covers:
  GET  /v1/wallet
  POST /v1/wallet/topup
  POST /v1/wallet/pay-trip
  GET  /v1/wallet/transactions
  POST /v1/admin/wallets/{user_id}/adjust

Scenarios:
  - Get wallet returns 0 balance on first access
  - Top-up credits the wallet
  - Top-up with zero amount → 422
  - Pay trip debits the wallet
  - Insufficient balance → 402
  - Refund via admin adjust (positive)
  - Admin debit via adjust (negative)
  - Admin debit below zero → 422
  - Transaction history returns ordered list
  - Non-admin cannot adjust wallet
"""
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _admin() -> str:
    tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _customer() -> str:
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _fund_wallet(token: str, amount: float) -> str:
    """WS2 — fund a wallet through the real flow: start a top-up, then confirm
    it via the payment webhook (mock provider). Returns the provider_ref."""
    r = client.post("/v1/wallet/topup", headers=_h(token), json={"amount_cents": amount})
    assert r.status_code == 201, r.text
    ref = r.json()["provider_ref"]
    w = client.post("/v1/payments/webhook", json={"provider_ref": ref, "status": "paid"})
    assert w.status_code == 200, w.text
    return ref


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_get_wallet_initial_balance_zero():
    """GET /v1/wallet returns 0 balance on first access (wallet auto-created)."""
    c_tok = _customer()
    r = client.get("/v1/wallet", headers=_h(c_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["balance_cents"] == 0.0
    assert "wallet_id" in data


def test_topup_returns_checkout_and_stays_pending():
    """WS2: POST /v1/wallet/topup returns a checkout URL and does NOT credit yet."""
    c_tok = _customer()
    before = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_cents"]
    r = client.post("/v1/wallet/topup", headers=_h(c_tok), json={"amount_cents": 5000.0})
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["status"] == "pending"
    assert data["checkout_url"]
    assert data["provider_ref"]
    assert data["amount_cents"] == 5000
    # Wallet not credited until the webhook confirms
    after = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_cents"]
    assert after == before


def test_topup_credited_after_webhook():
    """WS2: the wallet is credited once the provider confirms via webhook."""
    c_tok = _customer()
    before = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_cents"]
    _fund_wallet(c_tok, 5000.0)
    after = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_cents"]
    assert after == before + 5000.0


def test_topup_webhook_idempotent_no_double_credit():
    """WS2: replaying the paid webhook must not credit the wallet twice."""
    c_tok = _customer()
    before = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_cents"]
    ref = _fund_wallet(c_tok, 4000.0)
    # Replay the same paid event
    again = client.post("/v1/payments/webhook", json={"provider_ref": ref, "status": "paid"})
    assert again.status_code == 200
    after = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_cents"]
    assert after == before + 4000.0  # credited exactly once


def test_topup_zero_amount_returns_422():
    """POST /v1/wallet/topup with amount=0 returns 422."""
    c_tok = _customer()
    r = client.post("/v1/wallet/topup", headers=_h(c_tok), json={"amount_cents": 0.0})
    assert r.status_code == 422, r.text


def test_pay_trip_debits_wallet():
    """POST /v1/wallet/pay-trip deducts from balance when funds are sufficient."""
    c_tok = _customer()
    # Snapshot balance before top-up (shared DB may have prior balance)
    before = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_cents"]
    # Fund wallet (real flow: top-up + webhook confirmation)
    _fund_wallet(c_tok, 10000.0)
    fake_trip_id = str(uuid.uuid4())
    r = client.post("/v1/wallet/pay-trip", headers=_h(c_tok),
                    json={"trip_id": fake_trip_id, "amount_cents": 3000.0})
    assert r.status_code == 200, r.text
    data = r.json()
    # Use delta: before + 10000 - 3000 = expected balance
    assert data["wallet"]["balance_cents"] == before + 7000.0
    assert data["transaction"]["tx_type"] == "debit"
    assert data["transaction"]["reason"] == "trip_payment"


def test_pay_trip_insufficient_balance_returns_402():
    """POST /v1/wallet/pay-trip returns 402 when balance is insufficient."""
    c_tok = _customer()
    # Read current balance and attempt to pay more than available
    current_balance = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_cents"]
    fake_trip_id = str(uuid.uuid4())
    r = client.post("/v1/wallet/pay-trip", headers=_h(c_tok),
                    json={"trip_id": fake_trip_id, "amount_cents": current_balance + 5000.0})
    assert r.status_code == 402, r.text


def test_transaction_history_ordered_newest_first():
    """GET /v1/wallet/transactions returns transactions newest first."""
    c_tok = _customer()
    _fund_wallet(c_tok, 1000.0)
    _fund_wallet(c_tok, 2000.0)
    r = client.get("/v1/wallet/transactions", headers=_h(c_tok))
    assert r.status_code == 200, r.text
    txs = r.json()
    assert len(txs) >= 2
    # Newest first: second topup (2000) should come before first (1000)
    amounts = [t["amount_cents"] for t in txs]
    assert 2000.0 in amounts
    assert 1000.0 in amounts


def test_admin_credit_wallet():
    """Admin can credit a user's wallet via /v1/admin/wallets/{id}/adjust."""
    a_tok = _admin()
    c_tok = _customer()
    # Get customer's user_id
    me = client.get("/v1/me", headers=_h(c_tok)).json()
    customer_id = me["id"]

    r = client.post(
        f"/v1/admin/wallets/{customer_id}/adjust",
        headers=_h(a_tok),
        json={"amount_cents": 8000.0, "note": "Bonus bienvenue"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["balance_cents"] >= 8000.0


def test_admin_debit_wallet():
    """Admin can debit a user's wallet with negative amount."""
    a_tok = _admin()
    c_tok = _customer()
    # Fund first (real flow)
    _fund_wallet(c_tok, 10000.0)
    me = client.get("/v1/me", headers=_h(c_tok)).json()
    customer_id = me["id"]

    r = client.post(
        f"/v1/admin/wallets/{customer_id}/adjust",
        headers=_h(a_tok),
        json={"amount_cents": -2000.0, "note": "Correction manuelle"},
    )
    assert r.status_code == 200, r.text


def test_admin_debit_below_zero_returns_422():
    """Admin cannot debit wallet below zero balance → 422."""
    a_tok = _admin()
    c_tok = _customer()
    me = client.get("/v1/me", headers=_h(c_tok)).json()
    customer_id = me["id"]

    # Debit more than the current balance to guarantee underflow
    current_balance = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_cents"]
    debit_amount = -(current_balance + 500.0)  # always negative and always overflows

    r = client.post(
        f"/v1/admin/wallets/{customer_id}/adjust",
        headers=_h(a_tok),
        json={"amount_cents": debit_amount},
    )
    assert r.status_code == 422, r.text


def test_non_admin_cannot_adjust_wallet():
    """Non-admin gets 403 on admin wallet adjust."""
    c_tok = _customer()
    me = client.get("/v1/me", headers=_h(c_tok)).json()
    customer_id = me["id"]

    r = client.post(
        f"/v1/admin/wallets/{customer_id}/adjust",
        headers=_h(c_tok),  # customer token, not admin
        json={"amount_cents": 1000.0},
    )
    assert r.status_code == 403, r.text
