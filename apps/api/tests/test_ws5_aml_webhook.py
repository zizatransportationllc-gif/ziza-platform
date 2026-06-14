"""WS5 (Sprint 68) — AML limits + production webhook signature guard."""
import pytest
from fastapi.testclient import TestClient

import app.config as _config
from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


# ---------------------------------------------------------------------------
# AML limits
# ---------------------------------------------------------------------------

def test_topup_over_single_limit_returns_422():
    c = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c))
    over = _config.settings.topup_max_single_cents + 1
    r = client.post("/v1/wallet/topup", headers=_h(c), json={"amount_cents": float(over)})
    assert r.status_code == 422, r.text


def test_withdrawal_over_aml_limit_returns_422(monkeypatch):
    # Lower the per-request cap so a small request trips the AML check first.
    monkeypatch.setattr(_config.settings, "withdrawal_max_single_cents", 50, raising=False)
    d = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(d))
    client.post("/v1/drivers/register", headers=_h(d))
    r = client.post("/v1/drivers/me/payout-requests", headers=_h(d), json={"amount_cents": 100})
    assert r.status_code == 422
    assert "per-request limit" in r.json()["detail"]


def test_pro_withdrawal_over_aml_limit_returns_422(monkeypatch):
    monkeypatch.setattr(_config.settings, "withdrawal_max_single_cents", 50, raising=False)
    p = _tok("professional@ziza.dev")
    client.post("/v1/auth/register", headers=_h(p))
    client.post("/v1/craft/professionals/register", headers=_h(p), json={"specialties": "tow"})
    r = client.post("/v1/craft/professionals/me/payout-requests", headers=_h(p), json={"amount_cents": 100})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Production webhook signature guard
# ---------------------------------------------------------------------------

def test_webhook_rejected_in_prod_with_mock_provider(monkeypatch):
    """In prod, the unsigned mock provider must be rejected (forged-webhook guard)."""
    monkeypatch.setattr(_config.settings, "environment", "prod", raising=False)
    r = client.post("/v1/payments/webhook", json={"provider_ref": "x", "status": "paid"})
    assert r.status_code == 503


def test_webhook_allowed_in_dev():
    """In dev the mock provider is fine (unknown ref → 404, not 503)."""
    r = client.post("/v1/payments/webhook", json={"provider_ref": "mock-unknown", "status": "paid"})
    assert r.status_code == 404
