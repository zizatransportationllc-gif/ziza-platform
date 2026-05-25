"""Sprint 11 — driver earnings & admin statistics tests (11 tests).

Scenarios covered:
  GET /v1/drivers/me/earnings  — zero state, after completed trip, wrong role
  GET /v1/admin/stats          — shape, counts, admin-only
  GET /v1/admin/trips          — list, pagination, admin-only
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
    client.post("/v1/auth/register", headers=_headers(token))
    client.post("/v1/drivers/register", headers=_headers(token))


def _ensure_customer(token: str) -> None:
    client.post("/v1/auth/register", headers=_headers(token))


def _complete_a_trip(tc: str, td: str) -> str:
    """Walk a trip from estimate → booking → accept → start → complete.
    Returns trip_id.
    """
    _ensure_customer(tc)
    _ensure_driver(td)

    # Estimate (Plateau → Yopougon coords)
    est = client.post(
        "/v1/estimate",
        json={
            "origin_lat": 5.3207, "origin_lng": -4.0175,
            "dest_lat": 5.3600, "dest_lng": -3.9801,
        },
        headers=_headers(tc),
    )
    assert est.status_code == 200, est.text
    estimate_id = est.json()["estimate_id"]

    # Book
    book = client.post(
        "/v1/trips",
        json={"estimate_id": estimate_id},
        headers=_headers(tc),
    )
    assert book.status_code == 201, book.text
    trip_id = book.json()["trip_id"]

    # Accept
    acc = client.patch(f"/v1/trips/{trip_id}/accept", headers=_headers(td))
    assert acc.status_code == 200, acc.text

    # Start
    start = client.patch(f"/v1/trips/{trip_id}/start", headers=_headers(td))
    assert start.status_code == 200, start.text

    # Complete
    done = client.patch(f"/v1/trips/{trip_id}/complete", headers=_headers(td))
    assert done.status_code == 200, done.text

    return trip_id


# ---------------------------------------------------------------------------
# Driver Earnings
# ---------------------------------------------------------------------------

def test_driver_earnings_zero_state():
    """Fresh driver with no completed trips returns all-zero summary."""
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    r = client.get("/v1/drivers/me/earnings", headers=_headers(td))
    assert r.status_code == 200
    body = r.json()
    assert "total_xof" in body
    assert "total_trips" in body
    assert "today_xof" in body
    assert "week_xof" in body
    assert "recent_trips" in body
    assert isinstance(body["recent_trips"], list)


def test_driver_earnings_after_completed_trip():
    """Completing a trip increases trip count and XOF total."""
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")

    # Get baseline
    r0 = client.get("/v1/drivers/me/earnings", headers=_headers(td))
    assert r0.status_code == 200
    before = r0.json()

    _complete_a_trip(tc, td)

    r1 = client.get("/v1/drivers/me/earnings", headers=_headers(td))
    assert r1.status_code == 200
    after = r1.json()

    assert after["total_trips"] >= before["total_trips"] + 1
    assert after["total_xof"] > before["total_xof"]
    assert len(after["recent_trips"]) >= 1

    trip = after["recent_trips"][0]
    assert "trip_id" in trip
    assert "fare_xof" in trip
    assert "completed_at" in trip


def test_driver_earnings_recent_trips_shape():
    """Each record in recent_trips has the expected fields."""
    td = _get_token("driver@ziza.dev")
    _ensure_driver(td)

    r = client.get("/v1/drivers/me/earnings", headers=_headers(td))
    assert r.status_code == 200
    trips = r.json()["recent_trips"]
    for t in trips:
        assert "trip_id" in t
        assert "fare_xof" in t
        assert "distance_km" in t
        assert "duration_min" in t
        assert "completed_at" in t


def test_driver_earnings_requires_driver_role():
    """Customer gets 403 on the earnings endpoint."""
    tc = _get_token("customer@ziza.dev")
    _ensure_customer(tc)
    r = client.get("/v1/drivers/me/earnings", headers=_headers(tc))
    assert r.status_code == 403


def test_driver_earnings_requires_auth():
    """Unauthenticated request returns 401/403."""
    r = client.get("/v1/drivers/me/earnings")
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Admin Statistics
# ---------------------------------------------------------------------------

def test_admin_stats_shape():
    """Admin stats response contains trips, assistance, drivers sections."""
    ta = _get_token("admin@ziza.dev")

    r = client.get("/v1/admin/stats", headers=_headers(ta))
    assert r.status_code == 200
    body = r.json()

    assert "trips" in body
    assert "assistance" in body
    assert "drivers" in body

    trips = body["trips"]
    assert "total" in trips
    assert "by_status" in trips
    assert "total_revenue_xof" in trips
    assert isinstance(trips["total"], int)
    assert isinstance(trips["total_revenue_xof"], int)

    assert "total" in body["assistance"]
    assert "total" in body["drivers"]


def test_admin_stats_reflects_completed_trip():
    """After completing a trip, revenue in stats increases."""
    ta = _get_token("admin@ziza.dev")
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")

    r0 = client.get("/v1/admin/stats", headers=_headers(ta))
    before_rev = r0.json()["trips"]["total_revenue_xof"]

    _complete_a_trip(tc, td)

    r1 = client.get("/v1/admin/stats", headers=_headers(ta))
    after_rev = r1.json()["trips"]["total_revenue_xof"]

    assert after_rev > before_rev


def test_admin_stats_requires_admin_role():
    """Driver / customer cannot access admin stats."""
    td = _get_token("driver@ziza.dev")
    r = client.get("/v1/admin/stats", headers=_headers(td))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Admin Trip List
# ---------------------------------------------------------------------------

def test_admin_trips_list():
    """Admin receives a list of trips with required fields."""
    ta = _get_token("admin@ziza.dev")

    r = client.get("/v1/admin/trips", headers=_headers(ta))
    assert r.status_code == 200
    trips = r.json()
    assert isinstance(trips, list)
    assert len(trips) >= 1

    first = trips[0]
    assert "trip_id" in first
    assert "status" in first
    assert "customer_email" in first
    assert "created_at" in first
    assert "updated_at" in first


def test_admin_trips_pagination():
    """limit and offset query params work correctly."""
    ta = _get_token("admin@ziza.dev")

    r_all = client.get("/v1/admin/trips?limit=50&offset=0", headers=_headers(ta))
    assert r_all.status_code == 200
    all_trips = r_all.json()

    if len(all_trips) >= 2:
        r_page = client.get("/v1/admin/trips?limit=1&offset=0", headers=_headers(ta))
        assert r_page.status_code == 200
        assert len(r_page.json()) == 1

        r_offset = client.get("/v1/admin/trips?limit=1&offset=1", headers=_headers(ta))
        assert r_offset.status_code == 200
        assert len(r_offset.json()) == 1

        # Different pages return different trips
        assert r_page.json()[0]["trip_id"] != r_offset.json()[0]["trip_id"]


def test_admin_trips_requires_admin_role():
    """Driver cannot access the admin trip list."""
    td = _get_token("driver@ziza.dev")
    r = client.get("/v1/admin/trips", headers=_headers(td))
    assert r.status_code == 403
