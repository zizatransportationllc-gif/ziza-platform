"""Sprint 31 — Feature Flags tests (6 tests).

Covers:
  GET   /v1/admin/flags
  PATCH /v1/admin/flags/{flag_name}
  GET   /v1/flags/{flag_name}   (public)

Scenarios:
  - GET list returns seeded defaults
  - GET single known flag
  - PATCH enable flag (admin only)
  - PATCH disable flag + set rollout_pct
  - Non-admin cannot PATCH
  - Public GET single flag (no auth required)
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

def test_admin_get_flags_list():
    """GET /v1/admin/flags returns a list with default flags seeded."""
    a_tok = _admin()
    r = client.get("/v1/admin/flags", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    names = [f["name"] for f in data]
    assert "payment_enabled" in names
    assert "beta_invite_only" in names


def test_admin_get_single_flag():
    """GET /v1/flags/{name} returns flag details (public)."""
    # Seed via admin first
    a_tok = _admin()
    client.get("/v1/admin/flags", headers=_h(a_tok))
    # Public access
    r = client.get("/v1/flags/payment_enabled")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == "payment_enabled"
    assert "enabled" in data
    assert "rollout_pct" in data


def test_admin_patch_flag_enable():
    """PATCH /v1/admin/flags/{name} enables a flag."""
    a_tok = _admin()
    r = client.patch(
        "/v1/admin/flags/beta_invite_only",
        headers=_h(a_tok),
        json={"enabled": True, "rollout_pct": 50},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["enabled"] is True
    assert data["rollout_pct"] == 50


def test_admin_patch_flag_disable():
    """PATCH /v1/admin/flags/{name} disables a flag."""
    a_tok = _admin()
    # Enable first
    client.patch("/v1/admin/flags/mobile_app_enabled", headers=_h(a_tok),
                 json={"enabled": True, "rollout_pct": 100})
    # Now disable
    r = client.patch(
        "/v1/admin/flags/mobile_app_enabled",
        headers=_h(a_tok),
        json={"enabled": False, "rollout_pct": 0},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["enabled"] is False
    assert data["rollout_pct"] == 0


def test_non_admin_cannot_patch_flag():
    """Non-admin cannot PATCH feature flags."""
    c_tok = _customer()
    r = client.patch(
        "/v1/admin/flags/payment_enabled",
        headers=_h(c_tok),
        json={"enabled": False},
    )
    assert r.status_code == 403, r.text


def test_public_get_flag_no_auth():
    """GET /v1/flags/{name} is accessible without authentication."""
    # Seed via admin first
    a_tok = _admin()
    client.get("/v1/admin/flags", headers=_h(a_tok))
    r = client.get("/v1/flags/driver_apply_enabled")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == "driver_apply_enabled"
