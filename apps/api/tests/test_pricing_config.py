"""Sprint 66 — admin-configurable USD pricing (base fare + per-mile rate)."""
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


def test_get_pricing_defaults():
    r = client.get("/v1/admin/settings/pricing", headers=_admin())
    assert r.status_code == 200
    body = r.json()
    assert body["base_fare_cents"] == 250   # $2.50 default
    assert body["per_mile_cents"] == 175    # $1.75 default
    assert body["currency"] == "USD"


def test_set_pricing_requires_admin():
    r = client.patch(
        "/v1/admin/settings/pricing",
        json={"base_fare_cents": 300, "per_mile_cents": 200},
        headers=_customer(),
    )
    assert r.status_code == 403


def test_set_pricing_rejects_out_of_range():
    r = client.patch(
        "/v1/admin/settings/pricing",
        json={"base_fare_cents": 0, "per_mile_cents": 200},
        headers=_admin(),
    )
    assert r.status_code == 422


def test_set_pricing_affects_estimate():
    # Admin bumps the base fare to $9.99
    r = client.patch(
        "/v1/admin/settings/pricing",
        json={"base_fare_cents": 999, "per_mile_cents": 175},
        headers=_admin(),
    )
    assert r.status_code == 200
    assert r.json()["base_fare_cents"] == 999

    # Same origin/dest → minimum (base) fare applies → reflects the new value
    e = client.post(
        "/v1/estimate",
        json={"origin_lat": 5.32, "origin_lng": -4.01, "dest_lat": 5.32, "dest_lng": -4.01},
        headers=_customer(),
    )
    assert e.status_code == 200
    assert e.json()["fare_xof"] == 999   # USD cents
    assert e.json()["currency"] == "USD"
