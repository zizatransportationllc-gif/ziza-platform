"""Customer home address on the profile (GET/PATCH /v1/profile)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _h(email: str = "customer@ziza.dev") -> dict:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    client.post("/v1/auth/register", headers=h)
    return h


def test_home_address_roundtrip():
    h = _h()
    r = client.patch("/v1/profile", headers=h, json={"home_address": "12 Main St, Newark, New Jersey"})
    assert r.status_code == 200, r.text
    assert r.json()["home_address"] == "12 Main St, Newark, New Jersey"
    # Persisted
    g = client.get("/v1/profile", headers=h)
    assert g.json()["home_address"] == "12 Main St, Newark, New Jersey"


def test_home_address_defaults_null_and_clears():
    h = _h()
    assert client.get("/v1/profile", headers=h).json()["home_address"] is None
    client.patch("/v1/profile", headers=h, json={"home_address": "X"})
    cleared = client.patch("/v1/profile", headers=h, json={"home_address": ""})
    assert cleared.json()["home_address"] is None
