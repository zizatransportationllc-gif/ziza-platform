"""Trips persist the customer-entered pickup/drop-off address labels so the
driver sees the same address the customer typed (not a reverse-geocode)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str = "customer@ziza.dev") -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _estimate(tc: str) -> str:
    r = client.post(
        "/v1/estimate",
        json={"origin_lat": 40.7357, "origin_lng": -74.1724, "dest_lat": 40.72, "dest_lng": -74.05},
        headers=_h(tc),
    )
    assert r.status_code == 200, r.text
    return r.json()["estimate_id"]


def test_trip_stores_and_returns_addresses():
    tc = _tok()
    client.post("/v1/auth/register", headers=_h(tc))
    est = _estimate(tc)
    r = client.post(
        "/v1/trips",
        json={
            "estimate_id": est,
            "origin_address": "123 Main Street, Newark, New Jersey",
            "dest_address": "Liberty State Park, Jersey City, New Jersey",
        },
        headers=_h(tc),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["origin_address"] == "123 Main Street, Newark, New Jersey"
    assert body["dest_address"] == "Liberty State Park, Jersey City, New Jersey"

    # Persisted: a fresh GET returns the same labels
    again = client.get(f"/v1/trips/{body['trip_id']}", headers=_h(tc))
    assert again.json()["origin_address"] == "123 Main Street, Newark, New Jersey"


def test_trip_addresses_optional():
    """Trips created without address labels still work (older clients)."""
    tc = _tok()
    client.post("/v1/auth/register", headers=_h(tc))
    est = _estimate(tc)
    r = client.post("/v1/trips", json={"estimate_id": est}, headers=_h(tc))
    assert r.status_code == 201, r.text
    assert r.json()["origin_address"] is None
