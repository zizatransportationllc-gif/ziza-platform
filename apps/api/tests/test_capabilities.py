"""Sprint 10 — driver capability specialisation tests (12 tests).

Scenarios covered:
  GET  /v1/drivers/me/capabilities       — empty initially, 403 for non-driver
  PUT  /v1/drivers/me/capabilities       — set valid, invalid type (422), 403 non-driver
  GET  /v1/assistance/driver/available   — filtered by capability vs. unfiltered
  GET  /v1/admin/drivers                 — list with capabilities, 403 for non-admin
  PUT  /v1/admin/drivers/{id}/capabilities — admin sets caps, 422 invalid, 403 non-admin
  ETA  on accept                         — eta_min present and > 0 in response
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_token(email: str = "customer@ziza.dev") -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _ensure_driver(token: str) -> None:
    """Register user + driver profile (idempotent)."""
    client.post("/v1/auth/register", headers=_headers(token))
    client.post("/v1/drivers/register", headers=_headers(token))


def _clear_capabilities(token: str) -> None:
    """Reset the driver's capabilities to empty (no filter)."""
    r = client.put(
        "/v1/drivers/me/capabilities",
        json={"capabilities": []},
        headers=_headers(token),
    )
    assert r.status_code == 200, r.text


def _create_assistance(token: str, req_type: str = "breakdown") -> str:
    """Customer creates an assistance request; returns request_id."""
    client.post("/v1/auth/register", headers=_headers(token))
    r = client.post(
        "/v1/assistance",
        json={"type": req_type, "lat": 5.3207, "lng": -4.0175},
        headers=_headers(token),
    )
    assert r.status_code == 201, r.text
    return r.json()["request_id"]


# ---------------------------------------------------------------------------
# Driver capabilities — self-service
# ---------------------------------------------------------------------------

def test_driver_get_capabilities_empty():
    """Fresh driver has empty capabilities (handles all types)."""
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)
    _clear_capabilities(td)  # reset from any previous test

    r = client.get("/v1/drivers/me/capabilities", headers=_headers(td))
    assert r.status_code == 200
    assert r.json()["capabilities"] == []


def test_driver_set_capabilities():
    """Driver sets two capability types; GET confirms them."""
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    r = client.put(
        "/v1/drivers/me/capabilities",
        json={"capabilities": ["breakdown", "tow"]},
        headers=_headers(td),
    )
    assert r.status_code == 200
    assert sorted(r.json()["capabilities"]) == ["breakdown", "tow"]

    r2 = client.get("/v1/drivers/me/capabilities", headers=_headers(td))
    assert sorted(r2.json()["capabilities"]) == ["breakdown", "tow"]

    _clear_capabilities(td)  # cleanup


def test_driver_set_invalid_capability_returns_422():
    """Unknown capability type returns 422."""
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    r = client.put(
        "/v1/drivers/me/capabilities",
        json={"capabilities": ["helicopter"]},
        headers=_headers(td),
    )
    assert r.status_code == 422


def test_capabilities_endpoint_requires_driver_role():
    """Customer cannot access driver capability endpoints."""
    tc = _get_token("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(tc))

    r_get = client.get("/v1/drivers/me/capabilities", headers=_headers(tc))
    assert r_get.status_code == 403

    r_put = client.put(
        "/v1/drivers/me/capabilities",
        json={"capabilities": ["tow"]},
        headers=_headers(tc),
    )
    assert r_put.status_code == 403


# ---------------------------------------------------------------------------
# Capability-filtered dispatch
# ---------------------------------------------------------------------------

def test_dispatch_filters_by_capability():
    """Driver with [tow] capability does NOT see a breakdown request."""
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    # Create a breakdown request
    _create_assistance(tc, req_type="breakdown")

    # Set driver capability to tow only
    client.put(
        "/v1/drivers/me/capabilities",
        json={"capabilities": ["tow"]},
        headers=_headers(td),
    )

    r = client.get("/v1/assistance/driver/available", headers=_headers(td))
    assert r.status_code == 200
    types_visible = [req["type"] for req in r.json()]
    assert "breakdown" not in types_visible

    _clear_capabilities(td)  # cleanup


def test_dispatch_no_filter_when_no_capabilities():
    """Driver with empty capabilities sees all pending requests."""
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)
    _clear_capabilities(td)

    # Create a breakdown request
    _create_assistance(tc, req_type="breakdown")

    r = client.get("/v1/assistance/driver/available", headers=_headers(td))
    assert r.status_code == 200
    # Should see at least one breakdown (may be more from other tests)
    types_visible = [req["type"] for req in r.json()]
    assert "breakdown" in types_visible


def test_dispatch_matches_declared_capability():
    """Driver with [breakdown] sees breakdown requests."""
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    _create_assistance(tc, req_type="breakdown")

    client.put(
        "/v1/drivers/me/capabilities",
        json={"capabilities": ["breakdown"]},
        headers=_headers(td),
    )

    r = client.get("/v1/assistance/driver/available", headers=_headers(td))
    assert r.status_code == 200
    types_visible = [req["type"] for req in r.json()]
    assert "breakdown" in types_visible

    _clear_capabilities(td)  # cleanup


# ---------------------------------------------------------------------------
# ETA on acceptance
# ---------------------------------------------------------------------------

def test_eta_set_on_accept():
    """eta_min is present and > 0 in the accept response."""
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)
    _clear_capabilities(td)

    req_id = _create_assistance(tc, req_type="fuel")

    r = client.patch(
        f"/v1/assistance/{req_id}/accept",
        headers=_headers(td),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "accepted"
    assert body["eta_min"] is not None
    assert body["eta_min"] > 0


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

def test_admin_list_drivers():
    """Admin can list all drivers; each has a capabilities field."""
    ta = _get_token("admin@ziza.dev")

    r = client.get("/v1/admin/drivers", headers=_headers(ta))
    assert r.status_code == 200
    drivers = r.json()
    assert isinstance(drivers, list)
    assert len(drivers) >= 1
    first = drivers[0]
    assert "driver_id" in first
    assert "email" in first
    assert "capabilities" in first
    assert isinstance(first["capabilities"], list)


def test_admin_list_drivers_requires_admin_role():
    """Non-admin (driver/customer) gets 403 on the admin list endpoint."""
    td = _get_token("driver@ziza.dev")
    r = client.get("/v1/admin/drivers", headers=_headers(td))
    assert r.status_code == 403


def test_admin_set_driver_capabilities():
    """Admin can set capabilities for any driver by driver_id."""
    ta = _get_token("admin@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    # Get driver_id from admin list
    drivers = client.get("/v1/admin/drivers", headers=_headers(ta)).json()
    driver_id = next(d["driver_id"] for d in drivers if d["user_id"] == "usr_002")

    r = client.put(
        f"/v1/admin/drivers/{driver_id}/capabilities",
        json={"capabilities": ["flat_tyre", "lockout"]},
        headers=_headers(ta),
    )
    assert r.status_code == 200
    assert sorted(r.json()["capabilities"]) == ["flat_tyre", "lockout"]

    # Verify via driver's own endpoint
    r2 = client.get("/v1/drivers/me/capabilities", headers=_headers(td))
    assert sorted(r2.json()["capabilities"]) == ["flat_tyre", "lockout"]

    _clear_capabilities(td)  # cleanup


def test_admin_set_driver_capabilities_invalid_type_returns_422():
    """Admin setting an unknown type returns 422."""
    ta = _get_token("admin@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    drivers = client.get("/v1/admin/drivers", headers=_headers(ta)).json()
    driver_id = next(d["driver_id"] for d in drivers if d["user_id"] == "usr_002")

    r = client.put(
        f"/v1/admin/drivers/{driver_id}/capabilities",
        json={"capabilities": ["submarine"]},
        headers=_headers(ta),
    )
    assert r.status_code == 422


def test_admin_set_capabilities_requires_admin_role():
    """Driver cannot call the admin capability endpoint."""
    ta = _get_token("admin@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    drivers = client.get("/v1/admin/drivers", headers=_headers(ta)).json()
    driver_id = next(d["driver_id"] for d in drivers if d["user_id"] == "usr_002")

    r = client.put(
        f"/v1/admin/drivers/{driver_id}/capabilities",
        json={"capabilities": ["tow"]},
        headers=_headers(td),
    )
    assert r.status_code == 403
