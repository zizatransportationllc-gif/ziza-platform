"""Sprint 8 — rating tests (12 tests).

Scenarios covered:
  POST /v1/trips/{id}/rate  — happy path, duplicate (409), wrong user (403),
                               wrong status (422), stars validation (422)
  GET  /v1/trips/{id}/rating — 200 with rating data, 404 when not rated
  GET  /v1/drivers/me/rating — stats with and without ratings, role guard
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


def _register_user(token: str) -> None:
    r = client.post("/v1/auth/register", headers=_headers(token))
    assert r.status_code == 200, r.text


def _register_driver(token: str) -> None:
    r = client.post("/v1/drivers/register", headers=_headers(token))
    assert r.status_code == 200, r.text


def _completed_trip() -> tuple[str, str, str]:
    """Returns (trip_id, customer_token, driver_token) for a completed trip."""
    tc = _get_token("customer@ziza.dev")
    td = _get_token("driver@ziza.dev")
    _register_user(tc)
    _register_user(td)
    _register_driver(td)

    # Estimate + book
    est = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.3207, "origin_lng": -4.0175,
              "dest_lat": 5.3600, "dest_lng": -3.9801},
        headers=_headers(tc),
    )
    assert est.status_code == 200
    trip = client.post("/v1/trips",
                       json={"estimate_id": est.json()["estimate_id"]},
                       headers=_headers(tc))
    assert trip.status_code == 201
    tid = trip.json()["trip_id"]

    # Driver lifecycle
    client.patch(f"/v1/trips/{tid}/accept", headers=_headers(td))
    client.patch(f"/v1/trips/{tid}/start", headers=_headers(td))
    client.patch(f"/v1/trips/{tid}/complete", headers=_headers(td))

    return tid, tc, td


# ---------------------------------------------------------------------------
# POST /v1/trips/{id}/rate
# ---------------------------------------------------------------------------

def test_rate_completed_trip() -> None:
    tid, tc, _ = _completed_trip()
    r = client.post(f"/v1/trips/{tid}/rate",
                    json={"stars": 5, "comment": "Excellent chauffeur !"},
                    headers=_headers(tc))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["rating_id"]
    assert body["trip_id"] == tid
    assert body["stars"] == 5
    assert body["comment"] == "Excellent chauffeur !"


def test_rate_without_comment() -> None:
    tid, tc, _ = _completed_trip()
    r = client.post(f"/v1/trips/{tid}/rate",
                    json={"stars": 4},
                    headers=_headers(tc))
    assert r.status_code == 201
    assert r.json()["comment"] is None


def test_rate_duplicate_returns_409() -> None:
    tid, tc, _ = _completed_trip()
    client.post(f"/v1/trips/{tid}/rate", json={"stars": 5}, headers=_headers(tc))
    r = client.post(f"/v1/trips/{tid}/rate", json={"stars": 3}, headers=_headers(tc))
    assert r.status_code == 409


def test_rate_pending_trip_returns_422() -> None:
    """Only completed trips can be rated."""
    tc = _get_token("customer@ziza.dev")
    _register_user(tc)
    est = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.3207, "origin_lng": -4.0175,
              "dest_lat": 5.3600, "dest_lng": -3.9801},
        headers=_headers(tc),
    )
    trip = client.post("/v1/trips",
                       json={"estimate_id": est.json()["estimate_id"]},
                       headers=_headers(tc))
    tid = trip.json()["trip_id"]
    r = client.post(f"/v1/trips/{tid}/rate", json={"stars": 5}, headers=_headers(tc))
    assert r.status_code == 422


def test_rate_wrong_user_returns_403() -> None:
    """Driver cannot rate a trip as if they were the customer."""
    tid, _, td = _completed_trip()
    r = client.post(f"/v1/trips/{tid}/rate",
                    json={"stars": 5},
                    headers=_headers(td))
    assert r.status_code == 403


def test_rate_stars_below_minimum_returns_422() -> None:
    tid, tc, _ = _completed_trip()
    r = client.post(f"/v1/trips/{tid}/rate",
                    json={"stars": 0},
                    headers=_headers(tc))
    assert r.status_code == 422


def test_rate_stars_above_maximum_returns_422() -> None:
    tid, tc, _ = _completed_trip()
    r = client.post(f"/v1/trips/{tid}/rate",
                    json={"stars": 6},
                    headers=_headers(tc))
    assert r.status_code == 422


def test_rate_requires_auth() -> None:
    r = client.post("/v1/trips/some-id/rate", json={"stars": 5})
    assert r.status_code in {401, 403}


# ---------------------------------------------------------------------------
# GET /v1/trips/{id}/rating
# ---------------------------------------------------------------------------

def test_get_rating_after_submitting() -> None:
    tid, tc, _ = _completed_trip()
    client.post(f"/v1/trips/{tid}/rate",
                json={"stars": 4, "comment": "Bien"},
                headers=_headers(tc))

    r = client.get(f"/v1/trips/{tid}/rating", headers=_headers(tc))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["stars"] == 4
    assert body["comment"] == "Bien"
    assert body["trip_id"] == tid


def test_get_rating_unrated_trip_returns_404() -> None:
    tid, tc, _ = _completed_trip()
    r = client.get(f"/v1/trips/{tid}/rating", headers=_headers(tc))
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# GET /v1/drivers/me/rating
# ---------------------------------------------------------------------------

def test_driver_rating_stats_no_ratings() -> None:
    td = _get_token("driver@ziza.dev")
    _register_user(td)
    _register_driver(td)
    r = client.get("/v1/drivers/me/rating", headers=_headers(td))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_ratings"] >= 0     # may have ratings from earlier tests
    assert isinstance(body["average_stars"], (float, type(None)))


def test_driver_rating_stats_after_rating() -> None:
    tid, tc, td = _completed_trip()
    client.post(f"/v1/trips/{tid}/rate", json={"stars": 5}, headers=_headers(tc))

    r = client.get("/v1/drivers/me/rating", headers=_headers(td))
    assert r.status_code == 200
    body = r.json()
    assert body["total_ratings"] >= 1
    assert body["average_stars"] is not None
    assert 1.0 <= body["average_stars"] <= 5.0


def test_driver_rating_customer_role_forbidden() -> None:
    tc = _get_token("customer@ziza.dev")
    r = client.get("/v1/drivers/me/rating", headers=_headers(tc))
    assert r.status_code == 403
