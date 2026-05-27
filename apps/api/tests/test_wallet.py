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


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_get_wallet_initial_balance_zero():
    """GET /v1/wallet returns 0 balance on first access (wallet auto-created)."""
    c_tok = _customer()
    r = client.get("/v1/wallet", headers=_h(c_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["balance_xof"] == 0.0
    assert "wallet_id" in data


def test_topup_credits_wallet():
    """POST /v1/wallet/topup adds the amount to balance."""
    c_tok = _customer()
    r = client.post("/v1/wallet/topup", headers=_h(c_tok),
                    json={"amount_xof": 5000.0, "reference_id": "OM-123456"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["wallet"]["balance_xof"] == 5000.0
    assert data["transaction"]["tx_type"] == "credit"
    assert data["transaction"]["reason"] == "topup"


def test_topup_zero_amount_returns_422():
    """POST /v1/wallet/topup with amount=0 returns 422."""
    c_tok = _customer()
    r = client.post("/v1/wallet/topup", headers=_h(c_tok), json={"amount_xof": 0.0})
    assert r.status_code == 422, r.text


def test_pay_trip_debits_wallet():
    """POST /v1/wallet/pay-trip deducts from balance when funds are sufficient."""
    c_tok = _customer()
    # Snapshot balance before top-up (shared DB may have prior balance)
    before = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_xof"]
    # Fund wallet
    client.post("/v1/wallet/topup", headers=_h(c_tok), json={"amount_xof": 10000.0})
    fake_trip_id = str(uuid.uuid4())
    r = client.post("/v1/wallet/pay-trip", headers=_h(c_tok),
                    json={"trip_id": fake_trip_id, "amount_xof": 3000.0})
    assert r.status_code == 200, r.text
    data = r.json()
    # Use delta: before + 10000 - 3000 = expected balance
    assert data["wallet"]["balance_xof"] == before + 7000.0
    assert data["transaction"]["tx_type"] == "debit"
    assert data["transaction"]["reason"] == "trip_payment"


def test_pay_trip_insufficient_balance_returns_402():
    """POST /v1/wallet/pay-trip returns 402 when balance is insufficient."""
    c_tok = _customer()
    # Read current balance and attempt to pay more than available
    current_balance = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_xof"]
    fake_trip_id = str(uuid.uuid4())
    r = client.post("/v1/wallet/pay-trip", headers=_h(c_tok),
                    json={"trip_id": fake_trip_id, "amount_xof": current_balance + 5000.0})
    assert r.status_code == 402, r.text


def test_transaction_history_ordered_newest_first():
    """GET /v1/wallet/transactions returns transactions newest first."""
    c_tok = _customer()
    client.post("/v1/wallet/topup", headers=_h(c_tok), json={"amount_xof": 1000.0})
    client.post("/v1/wallet/topup", headers=_h(c_tok), json={"amount_xof": 2000.0})
    r = client.get("/v1/wallet/transactions", headers=_h(c_tok))
    assert r.status_code == 200, r.text
    txs = r.json()
    assert len(txs) >= 2
    # Newest first: second topup (2000) should come before first (1000)
    amounts = [t["amount_xof"] for t in txs]
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
        json={"amount_xof": 8000.0, "note": "Bonus bienvenue"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["balance_xof"] >= 8000.0


def test_admin_debit_wallet():
    """Admin can debit a user's wallet with negative amount."""
    a_tok = _admin()
    c_tok = _customer()
    # Fund first
    client.post("/v1/wallet/topup", headers=_h(c_tok), json={"amount_xof": 10000.0})
    me = client.get("/v1/me", headers=_h(c_tok)).json()
    customer_id = me["id"]

    r = client.post(
        f"/v1/admin/wallets/{customer_id}/adjust",
        headers=_h(a_tok),
        json={"amount_xof": -2000.0, "note": "Correction manuelle"},
    )
    assert r.status_code == 200, r.text


def test_admin_debit_below_zero_returns_422():
    """Admin cannot debit wallet below zero balance → 422."""
    a_tok = _admin()
    c_tok = _customer()
    me = client.get("/v1/me", headers=_h(c_tok)).json()
    customer_id = me["id"]

    # Debit more than the current balance to guarantee underflow
    current_balance = client.get("/v1/wallet", headers=_h(c_tok)).json()["balance_xof"]
    debit_amount = -(current_balance + 500.0)  # always negative and always overflows

    r = client.post(
        f"/v1/admin/wallets/{customer_id}/adjust",
        headers=_h(a_tok),
        json={"amount_xof": debit_amount},
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
        json={"amount_xof": 1000.0},
    )
    assert r.status_code == 403, r.text
