"""Sprint 15 — Admin ratings view & enriched driver profile (5 tests).

Scenarios covered:
  GET /v1/admin/ratings       — list all ratings, shape, role guard
  GET /v1/drivers/me/profile  — avg_rating + total_ratings fields present
  GET /v1/admin/drivers       — avg_rating + total_ratings per driver record
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


def _make_rated_trip(stars: int = 5) -> str:
    """Create a completed, rated trip using standard dev accounts. Returns trip_id."""
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))

    d_tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(d_tok))
    client.post("/v1/drivers/register", headers=_h(d_tok))

    est_r = client.post(
        "/v1/estimate",
        headers=_h(c_tok),
        json={
            "origin_lat": 5.35, "origin_lng": -4.02,
            "dest_lat": 5.36,   "dest_lng": -4.03,
        },
    )
    est_id = est_r.json()["estimate_id"]

    trip_r = client.post(
        "/v1/trips",
        headers=_h(c_tok),
        json={"estimate_id": est_id},
    )
    trip_id = trip_r.json()["trip_id"]

    for action in ("accept", "start", "complete"):
        client.patch(f"/v1/trips/{trip_id}/{action}", headers=_h(d_tok))

    client.post(
        f"/v1/trips/{trip_id}/rate",
        headers=_h(c_tok),
        json={"stars": stars},
    )
    return trip_id


# ---------------------------------------------------------------------------
# Admin ratings list
# ---------------------------------------------------------------------------

def test_admin_list_ratings_empty_initially():
    """Admin ratings list returns 200 and a list (may be empty or not)."""
    tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    r = client.get("/v1/admin/ratings", headers=_h(tok))
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_admin_list_ratings_after_rating():
    """After a rated trip, admin can see it with expected fields."""
    _make_rated_trip(stars=4)
    tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))

    r = client.get("/v1/admin/ratings", headers=_h(tok))
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    rec = data[0]
    assert "rating_id" in rec
    assert "trip_id" in rec
    assert "driver_id" in rec
    assert "customer_email" in rec
    assert "stars" in rec


def test_admin_list_ratings_requires_admin():
    """A non-admin customer is forbidden from the ratings list."""
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    r = client.get("/v1/admin/ratings", headers=_h(tok))
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Driver profile — new avg_rating / total_ratings fields
# ---------------------------------------------------------------------------

def test_driver_profile_includes_avg_rating():
    """Driver profile now exposes avg_rating (None when unrated) and total_ratings."""
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))

    r = client.get("/v1/drivers/me/profile", headers=_h(tok))
    assert r.status_code == 200
    data = r.json()
    assert "avg_rating" in data
    assert "total_ratings" in data
    # avg_rating may be None (no ratings yet) or a float (rated by another test)
    assert data["avg_rating"] is None or isinstance(data["avg_rating"], (int, float))
    assert isinstance(data["total_ratings"], int)


def test_admin_drivers_list_includes_avg_rating():
    """Admin driver list includes avg_rating and total_ratings per driver record."""
    d_tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(d_tok))
    client.post("/v1/drivers/register", headers=_h(d_tok))

    a_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a_tok))

    r = client.get("/v1/admin/drivers", headers=_h(a_tok))
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    assert "avg_rating" in data[0]
    assert "total_ratings" in data[0]
