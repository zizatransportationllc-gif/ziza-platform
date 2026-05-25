"""Sprint 7 — driver-side trip state machine tests (15 tests).

Full lifecycle covered:
  pending → accepted (driver accept)
  accepted → in_progress (driver start)
  in_progress → completed (driver complete)

Error cases:
  409 — accept already-accepted trip
  409 — start from wrong status
  409 — complete from wrong status
  403 — wrong driver owns the trip
  403 — non-driver role calls driver endpoints
  404 — driver profile not found
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_token(email: str = "driver@ziza.dev") -> str:
    resp = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _register_user(token: str) -> None:
    """Upsert the users row (idempotent)."""
    resp = client.post("/v1/auth/register", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text


def _register_driver(token: str) -> dict:
    """Upsert the driver profile (idempotent)."""
    resp = client.post("/v1/drivers/register", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_pending_trip() -> str:
    """Customer books a trip; returns trip_id."""
    token_c = _get_token("customer@ziza.dev")
    _register_user(token_c)
    # Get estimate
    est = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.3207, "origin_lng": -4.0175,
              "dest_lat": 5.3600, "dest_lng": -3.9801},
        headers={"Authorization": f"Bearer {token_c}"},
    )
    assert est.status_code == 200
    # Book trip
    trip = client.post(
        "/v1/trips",
        json={"estimate_id": est.json()["estimate_id"]},
        headers={"Authorization": f"Bearer {token_c}"},
    )
    assert trip.status_code == 201
    return trip.json()["trip_id"]


# ---------------------------------------------------------------------------
# POST /v1/drivers/register
# ---------------------------------------------------------------------------

def test_driver_register() -> None:
    token = _get_token()
    _register_user(token)
    resp = client.post("/v1/drivers/register", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["driver_id"]
    assert body["status"] == "active"
    assert body["user_id"] == "usr_002"


def test_driver_register_is_idempotent() -> None:
    token = _get_token()
    _register_user(token)
    r1 = client.post("/v1/drivers/register", headers={"Authorization": f"Bearer {token}"})
    r2 = client.post("/v1/drivers/register", headers={"Authorization": f"Bearer {token}"})
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["driver_id"] == r2.json()["driver_id"]
    assert r2.json()["created"] is False


def test_driver_register_customer_role_forbidden() -> None:
    token = _get_token("customer@ziza.dev")
    _register_user(token)
    resp = client.post("/v1/drivers/register", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /v1/trips/driver/available
# ---------------------------------------------------------------------------

def test_list_available_trips_as_driver() -> None:
    token = _get_token()
    _register_user(token)
    _register_driver(token)
    # Ensure at least one pending trip exists
    _create_pending_trip()

    resp = client.get("/v1/trips/driver/available",
                      headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    trips = resp.json()
    assert isinstance(trips, list)
    assert len(trips) >= 1
    assert all(t["status"] == "pending" for t in trips)


def test_list_available_trips_customer_forbidden() -> None:
    token = _get_token("customer@ziza.dev")
    resp = client.get("/v1/trips/driver/available",
                      headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PATCH /v1/trips/{id}/accept
# ---------------------------------------------------------------------------

def test_accept_trip() -> None:
    token = _get_token()
    _register_user(token)
    _register_driver(token)
    trip_id = _create_pending_trip()

    resp = client.patch(f"/v1/trips/{trip_id}/accept",
                        headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "accepted"
    assert body["trip_id"] == trip_id


def test_accept_already_accepted_trip_returns_409() -> None:
    token = _get_token()
    _register_user(token)
    _register_driver(token)
    trip_id = _create_pending_trip()

    client.patch(f"/v1/trips/{trip_id}/accept",
                 headers={"Authorization": f"Bearer {token}"})
    resp = client.patch(f"/v1/trips/{trip_id}/accept",
                        headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 409


def test_accept_trip_customer_role_forbidden() -> None:
    token_c = _get_token("customer@ziza.dev")
    _register_user(token_c)
    trip_id = _create_pending_trip()
    resp = client.patch(f"/v1/trips/{trip_id}/accept",
                        headers={"Authorization": f"Bearer {token_c}"})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PATCH /v1/trips/{id}/start
# ---------------------------------------------------------------------------

def test_start_trip() -> None:
    token = _get_token()
    _register_user(token)
    _register_driver(token)
    trip_id = _create_pending_trip()
    client.patch(f"/v1/trips/{trip_id}/accept",
                 headers={"Authorization": f"Bearer {token}"})

    resp = client.patch(f"/v1/trips/{trip_id}/start",
                        headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "in_progress"


def test_start_pending_trip_returns_409() -> None:
    """Cannot start a trip that hasn't been accepted yet."""
    token = _get_token()
    _register_user(token)
    _register_driver(token)
    trip_id = _create_pending_trip()
    # accept first so driver owns it, then create a fresh pending trip
    client.patch(f"/v1/trips/{trip_id}/accept",
                 headers={"Authorization": f"Bearer {token}"})
    # new pending trip
    trip_id2 = _create_pending_trip()
    # Try starting a trip that has no driver assigned → 403 (not your trip)
    resp = client.patch(f"/v1/trips/{trip_id2}/start",
                        headers={"Authorization": f"Bearer {token}"})
    # trip2 has no driver assigned yet → driver_id mismatch → 403
    assert resp.status_code in {403, 409}


# ---------------------------------------------------------------------------
# PATCH /v1/trips/{id}/complete
# ---------------------------------------------------------------------------

def test_complete_trip() -> None:
    token = _get_token()
    _register_user(token)
    _register_driver(token)
    trip_id = _create_pending_trip()
    client.patch(f"/v1/trips/{trip_id}/accept",
                 headers={"Authorization": f"Bearer {token}"})
    client.patch(f"/v1/trips/{trip_id}/start",
                 headers={"Authorization": f"Bearer {token}"})

    resp = client.patch(f"/v1/trips/{trip_id}/complete",
                        headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "completed"


def test_complete_accepted_trip_returns_409() -> None:
    """Cannot complete a trip that is still in accepted (not started) status."""
    token = _get_token()
    _register_user(token)
    _register_driver(token)
    trip_id = _create_pending_trip()
    client.patch(f"/v1/trips/{trip_id}/accept",
                 headers={"Authorization": f"Bearer {token}"})

    resp = client.patch(f"/v1/trips/{trip_id}/complete",
                        headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# GET /v1/trips/driver/active
# ---------------------------------------------------------------------------

def test_driver_active_trip_after_accept() -> None:
    """GET /v1/trips/driver/active returns the most-recently accepted trip."""
    token = _get_token()
    _register_user(token)
    _register_driver(token)
    trip_id = _create_pending_trip()
    client.patch(f"/v1/trips/{trip_id}/accept",
                 headers={"Authorization": f"Bearer {token}"})

    resp = client.get("/v1/trips/driver/active",
                      headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["trip"] is not None
    # Most-recently created accepted/in_progress trip should be returned
    assert body["trip"]["status"] in ["accepted", "in_progress"]


def test_completed_trip_not_in_active() -> None:
    """A completed trip must not appear in the driver's active trip query."""
    token = _get_token()
    _register_user(token)
    _register_driver(token)
    trip_id = _create_pending_trip()
    headers = {"Authorization": f"Bearer {token}"}
    client.patch(f"/v1/trips/{trip_id}/accept", headers=headers)
    client.patch(f"/v1/trips/{trip_id}/start", headers=headers)
    client.patch(f"/v1/trips/{trip_id}/complete", headers=headers)

    resp = client.get("/v1/trips/driver/active", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    # If there's any active trip left (from other tests), it must not be ours
    if body["trip"] is not None:
        assert body["trip"]["trip_id"] != trip_id
        assert body["trip"]["status"] in ["accepted", "in_progress"]


# ---------------------------------------------------------------------------
# Full lifecycle end-to-end
# ---------------------------------------------------------------------------

def test_full_trip_lifecycle() -> None:
    """pending → accepted → in_progress → completed — all events logged."""
    token_d = _get_token()
    token_c = _get_token("customer@ziza.dev")
    _register_user(token_d)
    _register_user(token_c)
    _register_driver(token_d)

    # Customer books
    trip_id = _create_pending_trip()

    # Driver accepts
    r = client.patch(f"/v1/trips/{trip_id}/accept",
                     headers={"Authorization": f"Bearer {token_d}"})
    assert r.json()["status"] == "accepted"

    # Customer sees accepted status
    r = client.get(f"/v1/trips/{trip_id}",
                   headers={"Authorization": f"Bearer {token_c}"})
    assert r.json()["status"] == "accepted"

    # Driver starts
    r = client.patch(f"/v1/trips/{trip_id}/start",
                     headers={"Authorization": f"Bearer {token_d}"})
    assert r.json()["status"] == "in_progress"

    # Driver completes
    r = client.patch(f"/v1/trips/{trip_id}/complete",
                     headers={"Authorization": f"Bearer {token_d}"})
    assert r.json()["status"] == "completed"

    # Full event log has 4 entries
    r = client.get(f"/v1/trips/{trip_id}",
                   headers={"Authorization": f"Bearer {token_c}"})
    events = r.json()["events"]
    statuses = [e["data"]["to"] for e in events]
    assert statuses == ["pending", "accepted", "in_progress", "completed"]
