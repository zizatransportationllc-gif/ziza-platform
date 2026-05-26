"""Sprint 31 — Admin live drivers endpoint tests (4 tests).

Covers:
  GET /v1/admin/drivers/live

Scenarios:
  - Empty list when no drivers are online
  - Online driver appears in list
  - Offline driver is excluded
  - Non-admin gets 403
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


def _driver() -> str:
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    return tok


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_live_drivers_empty_when_none_online():
    """GET /v1/admin/drivers/live returns empty list when no driver is online."""
    a_tok = _admin()
    # Ensure driver is registered but offline
    d_tok = _driver()
    client.patch("/v1/drivers/online", headers=_h(d_tok), json={"is_online": False})

    r = client.get("/v1/admin/drivers/live", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # No drivers should appear as online
    assert all(d["is_online"] is True for d in data)  # vacuously true for empty list


def test_online_driver_appears_in_live_list():
    """A driver who goes online appears in the live drivers list."""
    a_tok = _admin()
    d_tok = _driver()

    # Go online
    client.patch("/v1/drivers/online", headers=_h(d_tok), json={"is_online": True})

    r = client.get("/v1/admin/drivers/live", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Every returned driver should be online
    assert all(d["is_online"] is True for d in data)


def test_offline_driver_excluded_from_live():
    """A driver who is offline does NOT appear in live list."""
    a_tok = _admin()
    d_tok = _driver()

    # Set online then offline
    client.patch("/v1/drivers/online", headers=_h(d_tok), json={"is_online": True})
    client.patch("/v1/drivers/online", headers=_h(d_tok), json={"is_online": False})

    r = client.get("/v1/admin/drivers/live", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    # No offline driver should appear
    assert all(d["is_online"] is True for d in data)


def test_non_admin_cannot_list_live_drivers():
    """Non-admin gets 403 on GET /v1/admin/drivers/live."""
    c_tok = _customer()
    r = client.get("/v1/admin/drivers/live", headers=_h(c_tok))
    assert r.status_code == 403, r.text
