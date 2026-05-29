"""Sprint 46 — Service zone enforcement tests (6 tests).

Verifies that:
  - POST /v1/estimate rejects origins/destinations outside all active city radii.
  - POST /v1/assistance rejects locations outside all active city radii.
  - Coordinates within an active city radius are accepted.
  - When no active cities exist the endpoints remain open (fail-open / backward compat).

City seeding strategy
---------------------
All default NJ cities are seeded with ``active=False`` so zone enforcement is
OFF by default (fail-open behaviour).  Each test that needs enforcement to be ON
activates Newark explicitly and deactivates it again at teardown.

Safe test coordinates
---------------------
- Newark (valid)    : lat=40.73, lng=-74.17   → within Newark 15 km radius
- Los Angeles (far) : lat=34.05, lng=-118.24  → outside all NJ cities
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


def _seed() -> tuple[list, str]:
    """Seed default cities and return (cities, admin_token)."""
    a_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a_tok))
    r = client.get("/v1/admin/cities", headers=_h(a_tok))
    assert r.status_code == 200, r.text
    return r.json(), a_tok


def _c_tok() -> str:
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


def _set_city_active(city_id: str, active: bool, a_tok: str) -> None:
    """Toggle a city's active flag (admin only)."""
    client.patch(
        f"/v1/admin/cities/{city_id}",
        headers=_h(a_tok),
        json={"active": active},
    )


# Newark, NJ coordinates (within Newark 15 km radius)
NEWARK_ORIGIN = {"origin_lat": 40.73, "origin_lng": -74.17}
NEWARK_DEST   = {"dest_lat":   40.72, "dest_lng":  -74.16}

# Los Angeles — far outside all NJ cities
LOS_ANGELES = {"lat": 34.05, "lng": -118.24}


# ---------------------------------------------------------------------------
# Estimate endpoint — zone enforcement
# ---------------------------------------------------------------------------

def test_estimate_valid_newark_coords_accepted():
    """Estimate with both origin and dest within Newark → 200."""
    cities, a_tok = _seed()
    newark = next((c for c in cities if c["name"] == "Newark"), None)
    assert newark is not None, "Newark not seeded"

    _set_city_active(newark["city_id"], True, a_tok)
    try:
        c_tok = _c_tok()
        r = client.post(
            "/v1/estimate",
            headers=_h(c_tok),
            json={**NEWARK_ORIGIN, **NEWARK_DEST},
        )
        assert r.status_code == 200, r.text
        assert "estimate_id" in r.json()
    finally:
        _set_city_active(newark["city_id"], False, a_tok)


def test_estimate_origin_outside_zone_rejected():
    """Estimate with origin in Los Angeles (outside all NJ cities) → 422."""
    cities, a_tok = _seed()
    newark = next((c for c in cities if c["name"] == "Newark"), None)
    assert newark is not None, "Newark not seeded"

    _set_city_active(newark["city_id"], True, a_tok)
    try:
        c_tok = _c_tok()
        r = client.post(
            "/v1/estimate",
            headers=_h(c_tok),
            json={
                "origin_lat": LOS_ANGELES["lat"], "origin_lng": LOS_ANGELES["lng"],
                **NEWARK_DEST,
            },
        )
        assert r.status_code == 422, r.text
        assert "service area" in r.json()["detail"].lower()
    finally:
        _set_city_active(newark["city_id"], False, a_tok)


def test_estimate_dest_outside_zone_rejected():
    """Estimate with destination in Los Angeles (outside all NJ cities) → 422."""
    cities, a_tok = _seed()
    newark = next((c for c in cities if c["name"] == "Newark"), None)
    assert newark is not None, "Newark not seeded"

    _set_city_active(newark["city_id"], True, a_tok)
    try:
        c_tok = _c_tok()
        r = client.post(
            "/v1/estimate",
            headers=_h(c_tok),
            json={
                **NEWARK_ORIGIN,
                "dest_lat": LOS_ANGELES["lat"], "dest_lng": LOS_ANGELES["lng"],
            },
        )
        assert r.status_code == 422, r.text
        assert "service area" in r.json()["detail"].lower()
    finally:
        _set_city_active(newark["city_id"], False, a_tok)


def test_no_active_zones_enforcement_off():
    """When no cities are active, any coords are accepted (fail-open)."""
    cities, a_tok = _seed()
    # Ensure all cities are inactive (they should be by default)
    for city in cities:
        _set_city_active(city["city_id"], False, a_tok)

    c_tok = _c_tok()
    r = client.post(
        "/v1/estimate",
        headers=_h(c_tok),
        json={
            "origin_lat": LOS_ANGELES["lat"], "origin_lng": LOS_ANGELES["lng"],
            "dest_lat": LOS_ANGELES["lat"] + 0.1, "dest_lng": LOS_ANGELES["lng"] + 0.1,
        },
    )
    # Fail-open: no active cities → enforcement OFF → 200
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Assistance endpoint — zone enforcement
# ---------------------------------------------------------------------------

def test_assistance_origin_outside_zone_rejected():
    """Assistance request with location in Los Angeles → 422."""
    cities, a_tok = _seed()
    newark = next((c for c in cities if c["name"] == "Newark"), None)
    assert newark is not None, "Newark not seeded"

    _set_city_active(newark["city_id"], True, a_tok)
    try:
        c_tok = _c_tok()
        r = client.post(
            "/v1/assistance",
            headers=_h(c_tok),
            json={"type": "breakdown", "lat": LOS_ANGELES["lat"], "lng": LOS_ANGELES["lng"]},
        )
        assert r.status_code == 422, r.text
        assert "service area" in r.json()["detail"].lower()
    finally:
        _set_city_active(newark["city_id"], False, a_tok)


def test_assistance_valid_coords_accepted():
    """Assistance request with location in Newark → 201."""
    cities, a_tok = _seed()
    newark = next((c for c in cities if c["name"] == "Newark"), None)
    assert newark is not None, "Newark not seeded"

    _set_city_active(newark["city_id"], True, a_tok)
    try:
        c_tok = _c_tok()
        r = client.post(
            "/v1/assistance",
            headers=_h(c_tok),
            json={"type": "breakdown", "lat": 40.73, "lng": -74.17},
        )
        assert r.status_code == 201, r.text
        assert r.json()["type"] == "breakdown"
    finally:
        _set_city_active(newark["city_id"], False, a_tok)
