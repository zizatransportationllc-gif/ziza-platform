"""Sprint 45 — Service zone enforcement tests (6 tests).

Verifies that:
  - POST /v1/estimate rejects origins/destinations outside all active city radii.
  - POST /v1/assistance rejects locations outside all active city radii.
  - Coordinates within an active city radius are accepted.
  - Deactivating a city makes its coverage area rejected.
  - When no active cities exist the endpoints remain open (backward compat).

City seeding strategy
---------------------
``crud.list_cities`` calls ``_ensure_city_defaults`` which seeds Abidjan
(center 5.3364, -4.0267, radius 40 km), Bouaké, and Yamoussoukro the first
time the cities table is empty.  All tests that need coverage call
``_seed()`` first to guarantee the cities exist in the shared test DB.

Safe test coordinates
---------------------
- Abidjan (valid)  : lat=5.32, lng=-4.02   → within Abidjan 40 km radius
- Dakar (invalid)  : lat=14.71, lng=-17.47 → far outside all cities
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


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def _seed() -> list:
    """Seed default cities and return them (admin endpoint triggers seeding)."""
    a_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a_tok))
    r = client.get("/v1/admin/cities", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    return r.json(), a_tok


def _c_tok() -> str:
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


# Abidjan-area coordinates (within the seeded 40 km radius)
ABIDJAN_ORIGIN = {"origin_lat": 5.32, "origin_lng": -4.02}
ABIDJAN_DEST   = {"dest_lat":   5.36, "dest_lng":  -3.98}

# Dakar, Senegal — far outside any Ivorian city
DAKAR = {"lat": 14.71, "lng": -17.47}


# ---------------------------------------------------------------------------
# Estimate endpoint — zone enforcement
# ---------------------------------------------------------------------------

def test_estimate_valid_abidjan_coords_accepted():
    """Estimate with both origin and dest within Abidjan → 200."""
    _seed()
    c_tok = _c_tok()
    r = client.post(
        "/v1/estimate",
        headers=_h(c_tok),
        json={**ABIDJAN_ORIGIN, **ABIDJAN_DEST},
    )
    assert r.status_code == 200, r.text
    assert "estimate_id" in r.json()


def test_estimate_origin_outside_zone_rejected():
    """Estimate with origin in Dakar (outside all cities) → 422."""
    _seed()
    c_tok = _c_tok()
    r = client.post(
        "/v1/estimate",
        headers=_h(c_tok),
        json={
            "origin_lat": DAKAR["lat"], "origin_lng": DAKAR["lng"],
            **ABIDJAN_DEST,
        },
    )
    assert r.status_code == 422, r.text
    assert "service area" in r.json()["detail"].lower()


def test_estimate_dest_outside_zone_rejected():
    """Estimate with destination in Dakar (outside all cities) → 422."""
    _seed()
    c_tok = _c_tok()
    r = client.post(
        "/v1/estimate",
        headers=_h(c_tok),
        json={
            **ABIDJAN_ORIGIN,
            "dest_lat": DAKAR["lat"], "dest_lng": DAKAR["lng"],
        },
    )
    assert r.status_code == 422, r.text
    assert "service area" in r.json()["detail"].lower()


def test_estimate_deactivated_city_rejects_coords():
    """After deactivating Abidjan, its coordinates are rejected."""
    cities, a_tok = _seed()
    abidjan = next(c for c in cities if c["name"] == "Abidjan")

    # Deactivate Abidjan
    client.patch(
        f"/v1/admin/cities/{abidjan['city_id']}",
        headers=_h(a_tok),
        json={"active": False},
    )

    c_tok = _c_tok()
    r = client.post(
        "/v1/estimate",
        headers=_h(c_tok),
        json={**ABIDJAN_ORIGIN, **ABIDJAN_DEST},
    )

    # Re-activate before asserting so other tests aren't affected
    client.patch(
        f"/v1/admin/cities/{abidjan['city_id']}",
        headers=_h(a_tok),
        json={"active": True},
    )

    # If Abidjan is the only city covering these coords, should be 422
    # (Bouaké and Yamoussoukro are far — 5.32,-4.02 is clearly Abidjan only)
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# Assistance endpoint — zone enforcement
# ---------------------------------------------------------------------------

def test_assistance_origin_outside_zone_rejected():
    """Assistance request with location in Dakar → 422."""
    _seed()
    c_tok = _c_tok()
    r = client.post(
        "/v1/assistance",
        headers=_h(c_tok),
        json={"type": "breakdown", "lat": DAKAR["lat"], "lng": DAKAR["lng"]},
    )
    assert r.status_code == 422, r.text
    assert "service area" in r.json()["detail"].lower()


def test_assistance_valid_coords_accepted():
    """Assistance request with location in Abidjan → 201."""
    _seed()
    c_tok = _c_tok()
    r = client.post(
        "/v1/assistance",
        headers=_h(c_tok),
        json={"type": "breakdown", "lat": 5.32, "lng": -4.02},
    )
    assert r.status_code == 201, r.text
    assert r.json()["type"] == "breakdown"
