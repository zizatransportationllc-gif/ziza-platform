"""Sprint 6 → Sprint 24 — /v1/trips tests (14 + 3 + 3 = 20 tests).

State machine covered:
  pending → cancelled   (customer cancel from pending)
  cancelled → cancelled  (409 — already terminal)

Sprint 23 additions:
  actor field on TripEvent ("customer" on create/cancel, "driver" on accept/complete)
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_token(email: str = "customer@ziza.dev") -> str:
    resp = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _register(token: str) -> None:
    """Upsert the user row (idempotent — safe to call multiple times)."""
    resp = client.post(
        "/v1/auth/register",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text


def _get_estimate(token: str) -> str:
    resp = client.post(
        "/v1/estimate",
        json={
            "origin_lat": 5.3207,
            "origin_lng": -4.0175,
            "dest_lat": 5.3600,
            "dest_lng": -3.9801,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["estimate_id"]


def _create_trip(token: str, estimate_id: str):
    return client.post(
        "/v1/trips",
        json={"estimate_id": estimate_id},
        headers={"Authorization": f"Bearer {token}"},
    )


# ---------------------------------------------------------------------------
# POST /v1/trips
# ---------------------------------------------------------------------------

def test_create_trip_from_estimate() -> None:
    token = _get_token()
    _register(token)
    estimate_id = _get_estimate(token)
    resp = _create_trip(token, estimate_id)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["trip_id"]
    assert body["status"] == "pending"
    assert body["estimate_id"] == estimate_id
    assert body["fare_cents"] >= 500


def test_create_trip_copies_fare_and_route() -> None:
    token = _get_token()
    _register(token)
    # Get the estimate first to compare values
    est_resp = client.post(
        "/v1/estimate",
        json={
            "origin_lat": 5.3386,
            "origin_lng": -4.0721,
            "dest_lat": 5.2537,
            "dest_lng": -3.9268,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert est_resp.status_code == 200
    est = est_resp.json()

    trip_resp = _create_trip(token, est["estimate_id"])
    assert trip_resp.status_code == 201
    trip = trip_resp.json()
    assert trip["fare_cents"] == est["fare_cents"]
    assert abs(trip["distance_km"] - est["distance_km"]) < 0.01
    assert trip["duration_min"] == est["duration_min"]
    assert abs(trip["origin_lat"] - 5.3386) < 0.001
    assert abs(trip["dest_lat"] - 5.2537) < 0.001


def test_create_trip_status_is_pending() -> None:
    token = _get_token()
    _register(token)
    estimate_id = _get_estimate(token)
    resp = _create_trip(token, estimate_id)
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"


def test_create_trip_requires_auth() -> None:
    resp = client.post("/v1/trips", json={"estimate_id": str(uuid.uuid4())})
    assert resp.status_code in {401, 403}


def test_create_trip_unknown_estimate() -> None:
    token = _get_token()
    _register(token)
    resp = _create_trip(token, str(uuid.uuid4()))
    assert resp.status_code == 404


def test_create_trip_wrong_user_estimate() -> None:
    """Estimate owned by customer cannot be booked by another user (driver)."""
    token_c = _get_token("customer@ziza.dev")
    token_d = _get_token("driver@ziza.dev")
    _register(token_c)
    _register(token_d)
    estimate_id = _get_estimate(token_c)          # owned by customer (usr_001)
    resp = _create_trip(token_d, estimate_id)     # attempted by driver (usr_002)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /v1/trips/{trip_id}
# ---------------------------------------------------------------------------

def test_get_trip_detail_and_events() -> None:
    token = _get_token()
    _register(token)
    estimate_id = _get_estimate(token)
    trip_id = _create_trip(token, estimate_id).json()["trip_id"]

    resp = client.get(
        f"/v1/trips/{trip_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["trip_id"] == trip_id
    assert body["status"] == "pending"
    # Events must be present for the detail endpoint
    assert isinstance(body["events"], list)
    assert len(body["events"]) >= 1
    first = body["events"][0]
    assert first["event_type"] == "status_changed"
    assert first["data"]["from"] is None
    assert first["data"]["to"] == "pending"


def test_get_trip_wrong_user() -> None:
    token_c = _get_token("customer@ziza.dev")
    token_a = _get_token("admin@ziza.dev")
    _register(token_c)
    _register(token_a)
    estimate_id = _get_estimate(token_c)
    trip_id = _create_trip(token_c, estimate_id).json()["trip_id"]

    resp = client.get(
        f"/v1/trips/{trip_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code == 403


def test_get_trip_not_found() -> None:
    token = _get_token()
    _register(token)
    resp = client.get(
        f"/v1/trips/{uuid.uuid4()}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 404


def test_get_trip_requires_auth() -> None:
    resp = client.get(f"/v1/trips/{uuid.uuid4()}")
    assert resp.status_code in {401, 403}


# ---------------------------------------------------------------------------
# PATCH /v1/trips/{trip_id}/cancel
# ---------------------------------------------------------------------------

def test_cancel_pending_trip() -> None:
    token = _get_token()
    _register(token)
    estimate_id = _get_estimate(token)
    trip_id = _create_trip(token, estimate_id).json()["trip_id"]

    resp = client.patch(
        f"/v1/trips/{trip_id}/cancel",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "cancelled"


def test_cancel_already_cancelled_returns_409() -> None:
    token = _get_token()
    _register(token)
    estimate_id = _get_estimate(token)
    trip_id = _create_trip(token, estimate_id).json()["trip_id"]

    # First cancel succeeds
    client.patch(f"/v1/trips/{trip_id}/cancel", headers={"Authorization": f"Bearer {token}"})
    # Second cancel must return 409
    resp = client.patch(
        f"/v1/trips/{trip_id}/cancel",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409


def test_cancel_trip_wrong_user() -> None:
    token_c = _get_token("customer@ziza.dev")
    token_a = _get_token("admin@ziza.dev")
    _register(token_c)
    _register(token_a)
    estimate_id = _get_estimate(token_c)
    trip_id = _create_trip(token_c, estimate_id).json()["trip_id"]

    resp = client.patch(
        f"/v1/trips/{trip_id}/cancel",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /v1/trips  (list)
# ---------------------------------------------------------------------------

def test_list_trips() -> None:
    token = _get_token()
    _register(token)
    # Create two trips
    e1 = _get_estimate(token)
    e2 = _get_estimate(token)
    _create_trip(token, e1)
    _create_trip(token, e2)

    resp = client.get("/v1/trips", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    trips = resp.json()
    assert isinstance(trips, list)
    assert len(trips) >= 2
    # Each item has the expected keys
    for t in trips:
        assert "trip_id" in t
        assert "status" in t
        assert "fare_cents" in t


def test_list_trips_requires_auth() -> None:
    resp = client.get("/v1/trips")
    assert resp.status_code in {401, 403}


# ---------------------------------------------------------------------------
# Sprint 23 — actor field on TripEvent (3 tests)
# ---------------------------------------------------------------------------

def _setup_driver(driver_email: str) -> str:
    tok = _get_token(driver_email)
    client.post("/v1/auth/register", headers={"Authorization": f"Bearer {tok}"})
    client.post("/v1/drivers/register", headers={"Authorization": f"Bearer {tok}"})
    return tok


def test_create_trip_event_has_actor_customer() -> None:
    """TripEvent created on trip booking must carry actor='customer'."""
    token = _get_token()
    _register(token)
    estimate_id = _get_estimate(token)
    trip_resp = _create_trip(token, estimate_id)
    trip_id = trip_resp.json()["trip_id"]

    detail = client.get(f"/v1/trips/{trip_id}",
                        headers={"Authorization": f"Bearer {token}"})
    assert detail.status_code == 200, detail.text
    events = detail.json()["events"]
    assert events, "Expected at least one event"
    first = events[0]
    assert first["event_type"] == "status_changed"
    assert first["actor"] == "customer"


def test_accept_trip_event_has_actor_driver() -> None:
    """TripEvent on driver accept must carry actor='driver'."""
    tc = _get_token("customer@ziza.dev")
    _register(tc)
    td = _setup_driver("driver@ziza.dev")

    estimate_id = _get_estimate(tc)
    trip_id = _create_trip(tc, estimate_id).json()["trip_id"]

    accept = client.patch(f"/v1/trips/{trip_id}/accept",
                          headers={"Authorization": f"Bearer {td}"})
    assert accept.status_code == 200, accept.text

    detail = client.get(f"/v1/trips/{trip_id}",
                        headers={"Authorization": f"Bearer {tc}"})
    assert detail.status_code == 200, detail.text
    events = detail.json()["events"]
    # Find the "accepted" event
    accepted_events = [e for e in events if e.get("data", {}) and
                       e["data"].get("to") == "accepted"]
    assert accepted_events, "No accepted event found"
    assert accepted_events[0]["actor"] == "driver"


def test_complete_trip_event_has_actor_driver() -> None:
    """TripEvent on driver complete must carry actor='driver'."""
    tc = _get_token("customer@ziza.dev")
    _register(tc)
    td = _setup_driver("driver@ziza.dev")

    estimate_id = _get_estimate(tc)
    trip_id = _create_trip(tc, estimate_id).json()["trip_id"]

    client.patch(f"/v1/trips/{trip_id}/accept",
                 headers={"Authorization": f"Bearer {td}"})
    client.patch(f"/v1/trips/{trip_id}/start",
                 headers={"Authorization": f"Bearer {td}"})
    client.patch(f"/v1/trips/{trip_id}/complete",
                 headers={"Authorization": f"Bearer {td}"})

    detail = client.get(f"/v1/trips/{trip_id}",
                        headers={"Authorization": f"Bearer {tc}"})
    assert detail.status_code == 200, detail.text
    events = detail.json()["events"]
    completed_events = [e for e in events if e.get("data", {}) and
                        e["data"].get("to") == "completed"]
    assert completed_events, "No completed event found"
    assert completed_events[0]["actor"] == "driver"


# ---------------------------------------------------------------------------
# Sprint 24 — paid_at field on TripResponse
# ---------------------------------------------------------------------------

def test_trip_has_no_paid_at_initially() -> None:
    """A newly created trip has paid_at = null."""
    token = _get_token()
    _register(token)
    estimate_id = _get_estimate(token)
    trip_resp = _create_trip(token, estimate_id)
    assert trip_resp.status_code == 201
    assert trip_resp.json()["paid_at"] is None


def test_trip_paid_at_null_after_completion() -> None:
    """A completed trip still has paid_at = null until payment webhook fires."""
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _register(tc)
    _register(td)
    client.post("/v1/drivers/register", headers={"Authorization": f"Bearer {td}"})

    estimate_id = _get_estimate(tc)
    trip_id = _create_trip(tc, estimate_id).json()["trip_id"]

    for action in ("accept", "start", "complete"):
        client.patch(
            f"/v1/trips/{trip_id}/{action}",
            headers={"Authorization": f"Bearer {td}"},
        )

    detail = client.get(
        f"/v1/trips/{trip_id}",
        headers={"Authorization": f"Bearer {tc}"},
    )
    assert detail.status_code == 200
    # paid_at must still be null — webhook has not fired yet
    assert detail.json()["paid_at"] is None


def test_trip_paid_at_set_after_webhook() -> None:
    """After webhook confirms payment, paid_at is populated on the trip."""
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _register(tc)
    _register(td)
    client.post("/v1/drivers/register", headers={"Authorization": f"Bearer {td}"})

    estimate_id = _get_estimate(tc)
    trip_id = _create_trip(tc, estimate_id).json()["trip_id"]

    for action in ("accept", "start", "complete"):
        client.patch(
            f"/v1/trips/{trip_id}/{action}",
            headers={"Authorization": f"Bearer {td}"},
        )

    # Create intent
    intent_resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": trip_id},
        headers={"Authorization": f"Bearer {tc}"},
    )
    assert intent_resp.status_code == 201
    provider_ref = intent_resp.json()["provider_ref"]

    # Simulate webhook
    client.post(
        "/v1/payments/webhook",
        json={"provider_ref": provider_ref, "status": "paid"},
    )

    # Check paid_at is now set
    detail = client.get(
        f"/v1/trips/{trip_id}",
        headers={"Authorization": f"Bearer {tc}"},
    )
    assert detail.status_code == 200
    assert detail.json()["paid_at"] is not None
