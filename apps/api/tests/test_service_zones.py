"""Sprint 32 — Service zone tests (5 tests).

Covers:
  GET  /v1/service-zones
  GET  /v1/admin/service-zones
  POST /v1/admin/service-zones
  GET  /v1/geo/point-in-service

Scenarios:
  - Admin creates service zone for a city
  - Public list returns active zones only
  - Admin list includes inactive zones
  - Point within Newark NJ returns in_service=True  (Sprint 46: US/NJ localization)
  - Point outside all cities returns in_service=False
"""
import uuid
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


def _get_newark_city_id(a_tok: str) -> str:
    """Seed cities and return Newark's city_id."""
    cities = client.get("/v1/admin/cities", headers=_h(a_tok)).json()
    for c in cities:
        if c["name"] == "Newark":
            return c["city_id"]
    raise AssertionError("Newark not found in cities")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_admin_create_service_zone():
    """POST /v1/admin/service-zones creates a zone linked to a city."""
    a_tok = _admin()
    city_id = _get_newark_city_id(a_tok)

    r = client.post(
        "/v1/admin/service-zones",
        headers=_h(a_tok),
        json={
            "city_id": city_id,
            "name": "Zone Centre-ville",
            "active": True,
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["name"] == "Zone Centre-ville"
    assert data["city_id"] == city_id
    assert "zone_id" in data


def test_public_service_zones_active_only():
    """GET /v1/service-zones returns only active zones."""
    a_tok = _admin()
    city_id = _get_newark_city_id(a_tok)

    # Create active zone
    client.post("/v1/admin/service-zones", headers=_h(a_tok),
                json={"city_id": city_id, "name": "Active Zone", "active": True})
    # Create inactive zone
    client.post("/v1/admin/service-zones", headers=_h(a_tok),
                json={"city_id": city_id, "name": "Inactive Zone", "active": False})

    r = client.get("/v1/service-zones")
    assert r.status_code == 200, r.text
    data = r.json()
    assert all(z["active"] is True for z in data)


def test_admin_service_zones_includes_inactive():
    """GET /v1/admin/service-zones includes inactive zones."""
    a_tok = _admin()
    city_id = _get_newark_city_id(a_tok)

    client.post("/v1/admin/service-zones", headers=_h(a_tok),
                json={"city_id": city_id, "name": "Inactive Zone 2", "active": False})

    r = client.get("/v1/admin/service-zones", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert any(z["active"] is False for z in data)


def test_point_within_newark_is_in_service():
    """GET /v1/geo/point-in-service returns in_service=True for Newark NJ.

    Sprint 46: US/NJ localization — replaced Abidjan with Newark.
    Newark center: (40.7357, -74.1724), radius 15 km.
    """
    a_tok = _admin()
    # Seed and explicitly activate Newark (default is inactive)
    cities = client.get("/v1/admin/cities", headers=_h(a_tok)).json()
    newark = next(c for c in cities if c["name"] == "Newark")
    client.patch(
        f"/v1/admin/cities/{newark['city_id']}",
        headers=_h(a_tok),
        json={"active": True},
    )

    # Downtown Newark — within 15 km of city center
    r = client.get("/v1/geo/point-in-service", params={"lat": 40.74, "lng": -74.18})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["in_service"] is True
    assert data["city_name"] == "Newark"


def test_point_outside_all_cities_is_not_in_service():
    """GET /v1/geo/point-in-service returns in_service=False for remote location."""
    a_tok = _admin()
    # Seed cities (all inactive by default) and activate Newark
    cities = client.get("/v1/admin/cities", headers=_h(a_tok)).json()
    newark = next(c for c in cities if c["name"] == "Newark")
    client.patch(
        f"/v1/admin/cities/{newark['city_id']}",
        headers=_h(a_tok),
        json={"active": True},
    )

    # Los Angeles — far from any NJ city
    r = client.get("/v1/geo/point-in-service", params={"lat": 34.05, "lng": -118.24})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["in_service"] is False
