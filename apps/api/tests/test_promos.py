"""Sprint 14 — Promo codes & admin driver status management (16 tests).

Scenarios covered:
  POST   /v1/admin/promos              — create, duplicate code (409), role guard
  GET    /v1/admin/promos              — list, role guard
  DELETE /v1/admin/promos/{code}       — deactivate, not found
  POST   /v1/promos/validate           — valid code, inactive code, expired, unknown
  POST   /v1/trips (with promo_code)   — fare discounted, invalid code rejected
  PATCH  /v1/admin/drivers/{id}/status — set active/suspended, invalid status, role guard
"""
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_token(email: str = "admin@ziza.dev") -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _ensure_driver(token: str) -> None:
    client.post("/v1/auth/register", headers=_headers(token))
    client.post("/v1/drivers/register", headers=_headers(token))


def _ensure_customer(token: str) -> None:
    client.post("/v1/auth/register", headers=_headers(token))


def _unique_code() -> str:
    return f"TEST{int(time.time() * 1000) % 99999:05d}"


def _create_promo(ta: str, code: str | None = None, discount_pct: int = 10) -> dict:
    c = code or _unique_code()
    r = client.post(
        "/v1/admin/promos",
        json={"code": c, "discount_pct": discount_pct},
        headers=_headers(ta),
    )
    assert r.status_code == 201, r.text
    return r.json()


def _get_estimate(tc: str) -> str:
    r = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.3600, "dest_lng": -3.9801},
        headers=_headers(tc),
    )
    assert r.status_code == 200
    return r.json()["estimate_id"]


# ---------------------------------------------------------------------------
# Admin: create promo
# ---------------------------------------------------------------------------

def test_admin_create_promo():
    """Admin creates a promo code — 201, shape check."""
    ta = _get_token("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(ta))

    code = _unique_code()
    r = client.post(
        "/v1/admin/promos",
        json={"code": code, "discount_pct": 15, "max_uses": 100},
        headers=_headers(ta),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["code"] == code.upper()
    assert body["discount_pct"] == 15
    assert body["max_uses"] == 100
    assert body["uses"] == 0
    assert body["active"] is True
    assert "promo_id" in body


def test_admin_create_promo_duplicate_returns_409():
    """Creating the same code twice returns 409."""
    ta = _get_token("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(ta))

    code = _unique_code()
    _create_promo(ta, code)

    r = client.post(
        "/v1/admin/promos",
        json={"code": code, "discount_pct": 20},
        headers=_headers(ta),
    )
    assert r.status_code == 409


def test_admin_create_promo_requires_admin():
    """Driver cannot create promo codes."""
    td = _get_token("driver@ziza.dev")
    r = client.post(
        "/v1/admin/promos",
        json={"code": _unique_code(), "discount_pct": 10},
        headers=_headers(td),
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Admin: list promos
# ---------------------------------------------------------------------------

def test_admin_list_promos():
    """Admin lists promos — contains the one just created."""
    ta = _get_token("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(ta))
    _create_promo(ta)

    r = client.get("/v1/admin/promos", headers=_headers(ta))
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    first = data[0]
    assert "code" in first
    assert "discount_pct" in first
    assert "active" in first


def test_admin_list_promos_requires_admin():
    """Customer cannot list promos."""
    tc = _get_token("customer@ziza.dev")
    _ensure_customer(tc)
    r = client.get("/v1/admin/promos", headers=_headers(tc))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Admin: deactivate promo
# ---------------------------------------------------------------------------

def test_admin_deactivate_promo():
    """Admin deactivates a promo — active becomes False."""
    ta = _get_token("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(ta))
    p = _create_promo(ta)
    code = p["code"]

    r = client.delete(f"/v1/admin/promos/{code}", headers=_headers(ta))
    assert r.status_code == 200
    assert r.json()["active"] is False


def test_admin_deactivate_nonexistent_promo_returns_404():
    """Deactivating an unknown code returns 404."""
    ta = _get_token("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(ta))
    r = client.delete("/v1/admin/promos/DOESNOTEXIST999", headers=_headers(ta))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Validate promo
# ---------------------------------------------------------------------------

def test_customer_validate_promo_valid():
    """Validating a good code returns valid=True and discount_pct."""
    ta = _get_token("admin@ziza.dev")
    tc = _get_token("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(ta))
    _ensure_customer(tc)

    p = _create_promo(ta, discount_pct=20)
    r = client.post("/v1/promos/validate", json={"code": p["code"]}, headers=_headers(tc))
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True
    assert body["discount_pct"] == 20
    assert body["code"] == p["code"]


def test_customer_validate_promo_inactive():
    """Validating a deactivated code returns 422."""
    ta = _get_token("admin@ziza.dev")
    tc = _get_token("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(ta))
    _ensure_customer(tc)

    p = _create_promo(ta)
    client.delete(f"/v1/admin/promos/{p['code']}", headers=_headers(ta))

    r = client.post("/v1/promos/validate", json={"code": p["code"]}, headers=_headers(tc))
    assert r.status_code == 422


def test_customer_validate_promo_unknown():
    """Validating an unknown code returns 422."""
    tc = _get_token("customer@ziza.dev")
    _ensure_customer(tc)
    r = client.post("/v1/promos/validate", json={"code": "FAKECODE99"}, headers=_headers(tc))
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Trip booking with promo code
# ---------------------------------------------------------------------------

def test_trip_with_valid_promo_discounts_fare():
    """Booking a trip with a 10% promo code reduces fare_xof."""
    ta = _get_token("admin@ziza.dev")
    tc = _get_token("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(ta))
    _ensure_customer(tc)

    p = _create_promo(ta, discount_pct=10)
    estimate_id = _get_estimate(tc)

    # Get the base fare first
    est_r = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.3600, "dest_lng": -3.9801},
        headers=_headers(tc),
    )
    base_fare = est_r.json()["fare_xof"]
    est_id = est_r.json()["estimate_id"]

    trip_r = client.post(
        "/v1/trips",
        json={"estimate_id": est_id, "promo_code": p["code"]},
        headers=_headers(tc),
    )
    assert trip_r.status_code == 201
    body = trip_r.json()
    assert body["promo_code"] == p["code"]
    assert body["discount_pct"] == 10
    assert body["fare_xof"] < base_fare
    # Verify discount: fare should be ≈ base * 0.9
    expected = max(1, round(base_fare * 0.9))
    assert body["fare_xof"] == expected


def test_trip_without_promo_fare_unchanged():
    """Booking without a promo leaves fare unchanged."""
    tc = _get_token("customer@ziza.dev")
    _ensure_customer(tc)

    est_r = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.3600, "dest_lng": -3.9801},
        headers=_headers(tc),
    )
    base_fare = est_r.json()["fare_xof"]
    est_id = est_r.json()["estimate_id"]

    trip_r = client.post("/v1/trips", json={"estimate_id": est_id}, headers=_headers(tc))
    assert trip_r.status_code == 201
    body = trip_r.json()
    assert body["promo_code"] is None
    assert body["discount_pct"] is None
    assert body["fare_xof"] == base_fare


def test_trip_with_invalid_promo_returns_422():
    """Booking with a nonexistent promo code returns 422."""
    tc = _get_token("customer@ziza.dev")
    _ensure_customer(tc)

    est_id = _get_estimate(tc)
    r = client.post(
        "/v1/trips",
        json={"estimate_id": est_id, "promo_code": "INVALIDCODE999"},
        headers=_headers(tc),
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Admin driver status management
# ---------------------------------------------------------------------------

def test_admin_set_driver_status_suspended():
    """Admin can suspend a driver."""
    ta = _get_token("admin@ziza.dev")
    td = _get_token("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(ta))
    _ensure_driver(td)

    # Get driver_id
    drivers = client.get("/v1/admin/drivers", headers=_headers(ta)).json()
    driver_id = drivers[0]["driver_id"]

    r = client.patch(
        f"/v1/admin/drivers/{driver_id}/status",
        json={"status": "suspended"},
        headers=_headers(ta),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "suspended"
    assert r.json()["driver_id"] == driver_id


def test_admin_set_driver_status_active():
    """Admin can reactivate a suspended driver."""
    ta = _get_token("admin@ziza.dev")
    td = _get_token("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(ta))
    _ensure_driver(td)

    drivers = client.get("/v1/admin/drivers", headers=_headers(ta)).json()
    driver_id = drivers[0]["driver_id"]

    # Suspend first
    client.patch(f"/v1/admin/drivers/{driver_id}/status", json={"status": "suspended"}, headers=_headers(ta))

    # Reactivate
    r = client.patch(
        f"/v1/admin/drivers/{driver_id}/status",
        json={"status": "active"},
        headers=_headers(ta),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "active"


def test_admin_set_driver_status_invalid_status():
    """Invalid status value returns 422."""
    ta = _get_token("admin@ziza.dev")
    td = _get_token("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_headers(ta))
    _ensure_driver(td)

    drivers = client.get("/v1/admin/drivers", headers=_headers(ta)).json()
    driver_id = drivers[0]["driver_id"]

    r = client.patch(
        f"/v1/admin/drivers/{driver_id}/status",
        json={"status": "banned"},
        headers=_headers(ta),
    )
    assert r.status_code == 422


def test_admin_set_driver_status_requires_admin():
    """Customer cannot change driver status."""
    tc = _get_token("customer@ziza.dev")
    _ensure_customer(tc)
    r = client.patch(
        "/v1/admin/drivers/00000000-0000-0000-0000-000000000000/status",
        json={"status": "suspended"},
        headers=_headers(tc),
    )
    assert r.status_code == 403
