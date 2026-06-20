"""Admin-configurable fare formula — per-minute, minimum fare, and per-category
multipliers (extends the base fare + per-mile config)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _token(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _admin():
    return {"Authorization": f"Bearer {_token('admin@ziza.dev')}"}


def _customer():
    return {"Authorization": f"Bearer {_token('customer@ziza.dev')}"}


def test_pricing_exposes_all_coefficients():
    b = client.get("/v1/admin/settings/pricing", headers=_admin()).json()
    assert b["per_minute_cents"] == 0          # default: time component off
    assert b["min_fare_cents"] == 250          # defaults to base fare
    assert b["category_multipliers"]["economy"] == 1.0
    assert b["category_multipliers"]["comfort"] == 1.4
    assert b["category_multipliers"]["premium"] == 2.0


def test_set_full_formula_roundtrip():
    r = client.patch(
        "/v1/admin/settings/pricing",
        headers=_admin(),
        json={
            "base_fare_cents": 300,
            "per_mile_cents": 200,
            "per_minute_cents": 40,
            "min_fare_cents": 500,
            "category_multipliers": {"economy": 1.0, "comfort": 1.5, "premium": 2.5},
        },
    )
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["per_minute_cents"] == 40
    assert b["min_fare_cents"] == 500
    assert b["category_multipliers"]["comfort"] == 1.5
    assert b["category_multipliers"]["premium"] == 2.5


def test_per_minute_component_affects_estimate():
    client.patch(
        "/v1/admin/settings/pricing",
        headers=_admin(),
        json={"base_fare_cents": 100, "per_mile_cents": 1, "per_minute_cents": 5000, "min_fare_cents": 1},
    )
    # Same origin/dest → distance 0, duration falls back to 1 min → 100 + 1×5000
    e = client.post(
        "/v1/estimate",
        headers=_customer(),
        json={"origin_lat": 5.32, "origin_lng": -4.01, "dest_lat": 5.32, "dest_lng": -4.01},
    )
    assert e.status_code == 200, e.text
    assert e.json()["fare_cents"] == 5100


def test_category_multiplier_is_configurable():
    client.patch(
        "/v1/admin/settings/pricing",
        headers=_admin(),
        json={
            "base_fare_cents": 250,
            "per_mile_cents": 175,
            "category_multipliers": {"economy": 1.0, "comfort": 1.4, "premium": 3.0},
        },
    )
    e = client.post(
        "/v1/estimate",
        headers=_customer(),
        json={"origin_lat": 5.32, "origin_lng": -4.01, "dest_lat": 5.40, "dest_lng": -4.05},
    ).json()
    assert e["categories"]["premium"]["multiplier"] == 3.0
    assert e["categories"]["premium"]["fare_cents"] == max(1, round(e["fare_cents"] * 3.0))
