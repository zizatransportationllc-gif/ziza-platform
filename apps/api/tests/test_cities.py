"""Sprint 32 — Multi-city tests (6 tests).

Covers:
  GET  /v1/cities
  GET  /v1/cities/{id}
  GET  /v1/admin/cities
  POST /v1/admin/cities
  PATCH /v1/admin/cities/{id}

Scenarios:
  - Public list returns seeded default cities (active only)
  - Admin list includes inactive cities
  - Admin can create a new city
  - Admin can update a city (toggle active, change radius)
  - Duplicate city name returns 409
  - Non-admin cannot create city (403)
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

NEW_CITY = {
    "name": "San Pedro",
    "country": "Côte d'Ivoire",
    "center_lat": 4.7459,
    "center_lng": -6.6362,
    "radius_km": 15.0,
    "active": True,
}


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


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_public_list_cities_returns_active_only():
    """GET /v1/cities returns only active cities (Abidjan seeded as active)."""
    a_tok = _admin()
    # Trigger seeding via admin endpoint
    client.get("/v1/admin/cities", headers=_h(a_tok))

    r = client.get("/v1/cities")
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # All returned cities must be active
    assert all(c["active"] is True for c in data)
    # Abidjan should be in there
    names = [c["name"] for c in data]
    assert "Abidjan" in names


def test_admin_list_cities_includes_inactive():
    """GET /v1/admin/cities includes inactive cities."""
    a_tok = _admin()
    r = client.get("/v1/admin/cities", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # Bouaké and Yamoussoukro seeded as inactive — should appear
    assert len(data) >= 3


def test_admin_create_city():
    """POST /v1/admin/cities creates a new city."""
    a_tok = _admin()
    import uuid
    unique_name = f"TestCity-{uuid.uuid4().hex[:6]}"
    r = client.post(
        "/v1/admin/cities",
        headers=_h(a_tok),
        json={**NEW_CITY, "name": unique_name},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["name"] == unique_name
    assert data["radius_km"] == 15.0
    assert "city_id" in data


def test_admin_update_city():
    """PATCH /v1/admin/cities/{id} updates a city's fields."""
    a_tok = _admin()
    import uuid
    unique_name = f"PatchCity-{uuid.uuid4().hex[:6]}"
    # Create first
    create_r = client.post("/v1/admin/cities", headers=_h(a_tok),
                           json={**NEW_CITY, "name": unique_name})
    assert create_r.status_code == 201
    city_id = create_r.json()["city_id"]

    # Now update
    r = client.patch(
        f"/v1/admin/cities/{city_id}",
        headers=_h(a_tok),
        json={"radius_km": 25.0, "active": False},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["radius_km"] == 25.0
    assert data["active"] is False


def test_duplicate_city_name_returns_409():
    """Creating a city with an existing name returns 409."""
    a_tok = _admin()
    # Seed first
    client.get("/v1/admin/cities", headers=_h(a_tok))
    r = client.post(
        "/v1/admin/cities",
        headers=_h(a_tok),
        json={**NEW_CITY, "name": "Abidjan"},  # already exists
    )
    assert r.status_code == 409, r.text


def test_non_admin_cannot_create_city():
    """Non-admin gets 403 when trying to create a city."""
    c_tok = _customer()
    r = client.post("/v1/admin/cities", headers=_h(c_tok), json=NEW_CITY)
    assert r.status_code == 403, r.text
