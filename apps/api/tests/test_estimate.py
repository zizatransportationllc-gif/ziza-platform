"""Sprint 5 — /v1/estimate tests."""
import math

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pricing import haversine, calculate_fare, _haversine_route

client = TestClient(app)


# ---------------------------------------------------------------------------
# Unit tests — pricing engine
# ---------------------------------------------------------------------------

def test_haversine_same_point() -> None:
    assert haversine(5.32, -4.01, 5.32, -4.01) == 0.0


def test_haversine_known_distance() -> None:
    # Plateau → Cocody (~8 km straight line in Abidjan)
    d = haversine(5.3207, -4.0175, 5.3600, -3.9801)
    assert 5.0 < d < 12.0, f"Unexpected distance: {d:.2f} km"


def test_haversine_route_applies_road_factor() -> None:
    straight = haversine(5.3207, -4.0175, 5.3600, -3.9801)
    route = _haversine_route(5.3207, -4.0175, 5.3600, -3.9801)
    # road distance should be ~1.3× straight-line
    assert route.distance_km > straight
    assert route.source == "haversine"
    assert route.duration_min >= 1


class _FakeMapboxResp:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:  # noqa: D401
        pass

    def json(self) -> dict:
        return self._payload


def _fake_client_factory(payload=None, error: Exception | None = None):
    class _FakeClient:
        def __init__(self, *a, **k) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, url, params=None):
            if error is not None:
                raise error
            return _FakeMapboxResp(payload)

    return _FakeClient


def test_mapbox_route_parses_distance_and_duration(monkeypatch) -> None:
    import asyncio

    from app import pricing

    payload = {"code": "Ok", "routes": [{"distance": 7185.7, "duration": 627.3}]}
    monkeypatch.setattr(pricing.settings, "mapbox_access_token", "pk.test")
    monkeypatch.setattr(pricing.httpx, "AsyncClient", _fake_client_factory(payload=payload))

    route = asyncio.run(pricing.get_route_info(40.7357, -74.1645, 40.6895, -74.1745))
    assert route.source == "mapbox"
    assert route.distance_km == 7.19          # 7185.7 m → km, 2 dp
    assert route.duration_min == 10           # round(627.3 / 60)


def test_route_falls_back_to_haversine_when_mapbox_fails(monkeypatch) -> None:
    import asyncio

    from app import pricing

    monkeypatch.setattr(pricing.settings, "mapbox_access_token", "pk.test")
    monkeypatch.setattr(pricing.httpx, "AsyncClient", _fake_client_factory(error=RuntimeError("boom")))

    route = asyncio.run(pricing.get_route_info(5.3207, -4.0175, 5.3600, -3.9801))
    assert route.source == "haversine"


def test_calculate_fare_minimum() -> None:
    # Very short distance → minimum (base) fare applies. USD cents.
    fare = calculate_fare(0.0, 250, 175, surge=1.0)
    assert fare == 250  # base fare in cents ($2.50)


def test_calculate_fare_longer_trip() -> None:
    # 10 km ≈ 6.214 miles: 250 + miles × 175 cents
    from app.pricing import _KM_PER_MILE  # noqa: PLC0415
    miles = 10.0 / _KM_PER_MILE
    expected = round(250 + miles * 175)
    fare = calculate_fare(10.0, 250, 175, surge=1.0)
    assert fare == expected
    assert fare > 250


def test_calculate_fare_surge() -> None:
    from app.pricing import _KM_PER_MILE  # noqa: PLC0415
    miles = 10.0 / _KM_PER_MILE
    normal = calculate_fare(10.0, 250, 175, surge=1.0)
    surged = calculate_fare(10.0, 250, 175, surge=2.0)
    assert surged > normal
    # surge scales the (base + distance) amount by 2× (allowing for rounding)
    assert surged == max(250, round((250 + miles * 175) * 2))


# ---------------------------------------------------------------------------
# API tests — POST /v1/estimate
# ---------------------------------------------------------------------------

def _get_token(email: str = "customer@ziza.dev") -> str:
    resp = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def test_estimate_returns_fare() -> None:
    token = _get_token()
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
    body = resp.json()
    assert body["currency"] == "USD"
    assert body["fare_cents"] >= 250          # at least minimum (base) fare, USD cents
    assert body["distance_km"] > 0
    assert body["duration_min"] >= 1
    assert body["estimate_id"]              # UUID string
    assert "expires_at" in body
    assert body["distance_source"] == "haversine"  # no Google Maps key in tests


def test_estimate_saves_to_db_and_returns_uuid() -> None:
    """Two calls for the same route return different UUIDs."""
    token = _get_token()
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "origin_lat": 5.3386,
        "origin_lng": -4.0721,
        "dest_lat": 5.2537,
        "dest_lng": -3.9268,
    }
    r1 = client.post("/v1/estimate", json=payload, headers=headers)
    r2 = client.post("/v1/estimate", json=payload, headers=headers)
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["estimate_id"] != r2.json()["estimate_id"]
    # Fare must be equal for the same route
    assert r1.json()["fare_cents"] == r2.json()["fare_cents"]


def test_estimate_requires_auth() -> None:
    resp = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.32, "origin_lng": -4.01, "dest_lat": 5.36, "dest_lng": -3.98},
    )
    assert resp.status_code in {401, 403}


def test_estimate_validates_coordinates() -> None:
    token = _get_token()
    resp = client.post(
        "/v1/estimate",
        json={"origin_lat": 999, "origin_lng": -4.01, "dest_lat": 5.36, "dest_lng": -3.98},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422  # Pydantic validation error


def test_estimate_same_origin_dest() -> None:
    """Same point → minimum fare."""
    token = _get_token()
    resp = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.32, "origin_lng": -4.01, "dest_lat": 5.32, "dest_lng": -4.01},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["fare_cents"] == 250
