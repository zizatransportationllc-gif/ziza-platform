"""Public landing-page stats (/v1/stats) — Sprint 51 regression tests.

Guards against the bug where /v1/stats read the wrong keys from the stats
dict and always returned 0, and where the landing hard-coded cities to 1.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


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


def test_public_stats_shape_no_auth():
    """Returns the three integer counters, no auth required."""
    r = client.get("/v1/stats")
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("total_trips", "total_drivers", "total_cities"):
        assert key in body, body
        assert isinstance(body[key], int)


def test_public_stats_counts_active_cities():
    """Cities served reflects active cities (was hard-coded to 1)."""
    admin = _admin()
    before = client.get("/v1/stats").json()["total_cities"]
    r = client.post(
        "/v1/admin/cities",
        headers=_h(admin),
        json={
            "name": "Atlantic City",
            "center_lat": 39.3538,
            "center_lng": -74.4491,
            "radius_km": 15.0,
            "active": True,
        },
    )
    assert r.status_code == 201, r.text
    after = client.get("/v1/stats").json()["total_cities"]
    assert after == before + 1
