"""Sprint 29 — Commission settings tests (4 tests).

Covers:
  GET  /v1/admin/commission
  POST /v1/admin/commission

Scenarios:
  - GET returns list of commission settings (seeded defaults)
  - POST creates/updates a commission rate
  - Rate differs per category (economy ≠ premium)
  - Endpoint is admin-only (driver + customer → 403)
"""

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


def _setup_admin() -> str:
    tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _setup_driver() -> str:
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    return tok


def _setup_customer() -> str:
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_admin_get_commission_returns_settings():
    """GET /v1/admin/commission returns a list with at least one setting."""
    a_tok = _setup_admin()
    r = client.get("/v1/admin/commission", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Each entry must have the expected fields
    for entry in data:
        assert "category" in entry
        assert "rate_pct" in entry
        assert "effective_from" in entry
        assert isinstance(entry["rate_pct"], int)


def test_admin_post_commission_creates_or_updates():
    """POST /v1/admin/commission sets the rate for 'comfort' category."""
    a_tok = _setup_admin()
    r = client.post(
        "/v1/admin/commission",
        headers=_h(a_tok),
        json={"category": "comfort", "rate_pct": 18},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["category"] == "comfort"
    assert data["rate_pct"] == 18
    assert "effective_from" in data

    # Verify the change is visible via GET
    r_list = client.get("/v1/admin/commission", headers=_h(a_tok))
    settings = r_list.json()
    comfort = next((s for s in settings if s["category"] == "comfort"), None)
    assert comfort is not None
    assert comfort["rate_pct"] == 18


def test_commission_rate_differs_per_category():
    """Different categories can have different rates (economy ≠ premium)."""
    a_tok = _setup_admin()
    client.post("/v1/admin/commission", headers=_h(a_tok), json={
        "category": "economy", "rate_pct": 15
    })
    client.post("/v1/admin/commission", headers=_h(a_tok), json={
        "category": "premium", "rate_pct": 20
    })

    r = client.get("/v1/admin/commission", headers=_h(a_tok))
    settings = {s["category"]: s["rate_pct"] for s in r.json()}
    assert settings["economy"] == 15
    assert settings["premium"] == 20
    assert settings["economy"] != settings["premium"]


def test_commission_endpoints_admin_only():
    """Driver and customer cannot access commission endpoints — 403."""
    d_tok = _setup_driver()
    c_tok = _setup_customer()

    # GET
    assert client.get("/v1/admin/commission", headers=_h(d_tok)).status_code == 403
    assert client.get("/v1/admin/commission", headers=_h(c_tok)).status_code == 403

    # POST
    payload = {"category": "economy", "rate_pct": 10}
    assert client.post("/v1/admin/commission", headers=_h(d_tok), json=payload).status_code == 403
    assert client.post("/v1/admin/commission", headers=_h(c_tok), json=payload).status_code == 403
