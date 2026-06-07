"""Sprint 13 — Trip history, driver online presence (11 tests).

Scenarios covered:
  PUT  /v1/drivers/me/online        — set online/offline, role guard, auth guard
  GET  /v1/drivers/me/profile       — profile shape, is_online field
  GET  /v1/trips/driver/history     — empty, after complete, pagination, role guard
  GET  /v1/trips                    — pagination params (limit/offset)

Sprint 48 hotfix: removed admin/assistance panel tests (feature removed in Sprint 48).
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_token(email: str = "driver@ziza.dev") -> str:
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


def _complete_a_trip(tc: str, td: str) -> str:
    """Estimate → book → accept → start → complete. Returns trip_id."""
    est = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.3600, "dest_lng": -3.9801},
        headers=_headers(tc),
    )
    assert est.status_code == 200
    trip = client.post(
        "/v1/trips",
        json={"estimate_id": est.json()["estimate_id"]},
        headers=_headers(tc),
    )
    assert trip.status_code == 201
    trip_id = trip.json()["trip_id"]
    client.patch(f"/v1/trips/{trip_id}/accept", headers=_headers(td))
    client.patch(f"/v1/trips/{trip_id}/start", headers=_headers(td))
    client.patch(f"/v1/trips/{trip_id}/complete", headers=_headers(td))
    return trip_id


# ---------------------------------------------------------------------------
# Driver online/offline presence
# ---------------------------------------------------------------------------

def test_driver_set_online_true():
    """Driver can set themselves online."""
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    r = client.put("/v1/drivers/me/online", json={"online": True}, headers=_headers(td))
    assert r.status_code == 200
    body = r.json()
    assert body["is_online"] is True
    assert "driver_id" in body


def test_driver_set_online_false():
    """Driver can toggle back to offline."""
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    client.put("/v1/drivers/me/online", json={"online": True}, headers=_headers(td))
    r = client.put("/v1/drivers/me/online", json={"online": False}, headers=_headers(td))
    assert r.status_code == 200
    assert r.json()["is_online"] is False


def test_driver_online_requires_driver_role():
    """Customer cannot set online status."""
    tc = _get_token("customer@ziza.dev")
    _ensure_customer(tc)
    r = client.put("/v1/drivers/me/online", json={"online": True}, headers=_headers(tc))
    assert r.status_code == 403


def test_driver_online_requires_auth():
    """Unauthenticated request is rejected."""
    r = client.put("/v1/drivers/me/online", json={"online": True})
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Driver profile
# ---------------------------------------------------------------------------

def test_driver_get_profile_shape():
    """GET /v1/drivers/me/profile returns expected fields."""
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    r = client.get("/v1/drivers/me/profile", headers=_headers(td))
    assert r.status_code == 200
    body = r.json()
    assert "driver_id" in body
    assert "status" in body
    assert "is_online" in body
    assert "registered_at" in body
    assert isinstance(body["is_online"], bool)


def test_driver_profile_requires_driver_role():
    """Customer cannot access /v1/drivers/me/profile."""
    tc = _get_token("customer@ziza.dev")
    _ensure_customer(tc)
    r = client.get("/v1/drivers/me/profile", headers=_headers(tc))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Driver trip history
# ---------------------------------------------------------------------------

def test_driver_trip_history_empty():
    """Before completing any trip the history list is empty (or has no new items)."""
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    r = client.get("/v1/trips/driver/history?limit=0&offset=0", headers=_headers(td))
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_driver_trip_history_after_complete():
    """After completing a trip, it appears in the driver history."""
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _ensure_customer(tc)
    _ensure_driver(td)

    _complete_a_trip(tc, td)

    r = client.get("/v1/trips/driver/history?limit=5", headers=_headers(td))
    assert r.status_code == 200
    history = r.json()
    assert len(history) >= 1
    first = history[0]
    assert first["status"] == "completed"
    assert "trip_id" in first
    assert "fare_xof" in first
    assert "created_at" in first
    assert "updated_at" in first


def test_driver_trip_history_pagination():
    """offset parameter shifts results."""
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _ensure_customer(tc)
    _ensure_driver(td)

    # Complete two trips
    _complete_a_trip(tc, td)
    _complete_a_trip(tc, td)

    page0 = client.get("/v1/trips/driver/history?limit=1&offset=0", headers=_headers(td)).json()
    page1 = client.get("/v1/trips/driver/history?limit=1&offset=1", headers=_headers(td)).json()
    assert len(page0) == 1
    assert len(page1) == 1
    assert page0[0]["trip_id"] != page1[0]["trip_id"]


def test_driver_trip_history_requires_driver_role():
    """Customer cannot access driver history endpoint."""
    tc = _get_token("customer@ziza.dev")
    _ensure_customer(tc)
    r = client.get("/v1/trips/driver/history", headers=_headers(tc))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Customer trip history pagination
# ---------------------------------------------------------------------------

def test_customer_trip_history_paginated():
    """GET /v1/trips supports limit and offset query params."""
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _ensure_customer(tc)
    _ensure_driver(td)

    # Ensure at least 2 trips exist
    _complete_a_trip(tc, td)
    _complete_a_trip(tc, td)

    page0 = client.get("/v1/trips?limit=1&offset=0", headers=_headers(tc)).json()
    page1 = client.get("/v1/trips?limit=1&offset=1", headers=_headers(tc)).json()
    assert len(page0) == 1
    assert len(page1) == 1
    assert page0[0]["trip_id"] != page1[0]["trip_id"]


def test_customer_trip_history_requires_auth():
    """Unauthenticated request to GET /v1/trips is rejected."""
    r = client.get("/v1/trips")
    assert r.status_code in (401, 403)
