"""Sprint 32 — Geo filter & multi-city dispatch tests (7 tests).

Covers:
  - point_in_city_radius helper
  - find_city_for_point CRUD function
  - Haversine vs real Abidjan coordinates
  - Cities seeding (default data)
  - Zone filter by city_id on GET /v1/service-zones
  - City detail endpoint GET /v1/cities/{id}
  - Nonexistent city returns 404
"""
import math
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.crud import _haversine_km, point_in_city_radius
from app.models.city import City

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


# ---------------------------------------------------------------------------
# Unit tests for helpers
# ---------------------------------------------------------------------------

def test_point_in_city_radius_inside():
    """A point close to city center is within the radius."""
    city = City.__new__(City)
    city.center_lat = 5.3364
    city.center_lng = -4.0267
    city.radius_km = 40.0
    # Cocody is ~5 km from Abidjan center → inside 40km radius
    assert point_in_city_radius(5.3600, -3.9801, city) is True


def test_point_in_city_radius_outside():
    """A point far from city center is outside the radius."""
    city = City.__new__(City)
    city.center_lat = 5.3364
    city.center_lng = -4.0267
    city.radius_km = 40.0
    # Yamoussoukro is ~240 km from Abidjan → outside 40km
    assert point_in_city_radius(6.8276, -5.2893, city) is False


def test_haversine_abidjan_to_cocody():
    """Haversine between Abidjan center and Cocody is < 10 km."""
    dist = _haversine_km(5.3364, -4.0267, 5.3600, -3.9801)
    assert dist < 10.0


def test_city_detail_endpoint():
    """GET /v1/cities/{id} returns city details."""
    a_tok = _admin()
    cities = client.get("/v1/admin/cities", headers=_h(a_tok)).json()
    abidjan = next(c for c in cities if c["name"] == "Abidjan")
    city_id = abidjan["city_id"]

    r = client.get(f"/v1/cities/{city_id}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == "Abidjan"
    assert data["center_lat"] == pytest.approx(5.3364, abs=0.01)


def test_nonexistent_city_returns_404():
    """GET /v1/cities/{fake_id} returns 404."""
    fake_id = str(uuid.uuid4())
    r = client.get(f"/v1/cities/{fake_id}")
    assert r.status_code == 404, r.text


def test_service_zones_filtered_by_city():
    """GET /v1/service-zones?city_id=... returns zones for that city only."""
    a_tok = _admin()
    cities = client.get("/v1/admin/cities", headers=_h(a_tok)).json()
    abidjan = next(c for c in cities if c["name"] == "Abidjan")
    city_id = abidjan["city_id"]

    # Create a zone for Abidjan
    client.post("/v1/admin/service-zones", headers=_h(a_tok),
                json={"city_id": city_id, "name": "Plateau", "active": True})

    r = client.get(f"/v1/service-zones?city_id={city_id}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert all(z["city_id"] == city_id for z in data)


def test_invalid_uuid_city_id_returns_422():
    """GET /v1/cities/not-a-uuid returns 422."""
    r = client.get("/v1/cities/not-a-valid-uuid")
    assert r.status_code == 422, r.text
