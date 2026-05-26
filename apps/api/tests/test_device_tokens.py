"""Sprint 26 — Device token registration tests (6 tests).

Covers:
  POST /v1/devices/register  — register (customer, driver, idempotent, unauth)
  DELETE /v1/devices/{token} — deregister (success, unknown token)
"""
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


def _register(email: str) -> str:
    tok = _tok(email)
    client.post("/v1/auth/register", headers=_h(tok))
    return tok


# ---------------------------------------------------------------------------
# POST /v1/devices/register
# ---------------------------------------------------------------------------

def test_register_device_token_customer():
    """Customer can register a device token → 200."""
    tok = _register("customer@ziza.dev")
    r = client.post(
        "/v1/devices/register",
        headers=_h(tok),
        json={"token": "fcm-token-customer-001", "platform": "web"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["token"] == "fcm-token-customer-001"
    assert data["platform"] == "web"
    assert "user_id" in data


def test_register_device_token_driver():
    """Driver can register a device token → 200."""
    tok = _register("driver@ziza.dev")
    client.post("/v1/drivers/register", headers=_h(tok))
    r = client.post(
        "/v1/devices/register",
        headers=_h(tok),
        json={"token": "fcm-token-driver-001", "platform": "android"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["platform"] == "android"


def test_register_device_double_idempotent():
    """Registering the same token twice returns 200 both times (no duplicate)."""
    tok = _register("customer@ziza.dev")
    payload = {"token": "fcm-idempotent-token-999", "platform": "web"}
    r1 = client.post("/v1/devices/register", headers=_h(tok), json=payload)
    r2 = client.post("/v1/devices/register", headers=_h(tok), json=payload)
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    assert r1.json()["token"] == r2.json()["token"]


def test_register_device_requires_auth():
    """No auth token → 401."""
    r = client.post(
        "/v1/devices/register",
        json={"token": "some-fcm-token", "platform": "web"},
    )
    assert r.status_code == 401, r.text


# ---------------------------------------------------------------------------
# DELETE /v1/devices/{token}
# ---------------------------------------------------------------------------

def test_deregister_device_token():
    """Customer deregisters their own device token → 204."""
    tok = _register("customer@ziza.dev")
    # First register
    client.post(
        "/v1/devices/register",
        headers=_h(tok),
        json={"token": "fcm-to-delete-001", "platform": "web"},
    )
    # Then deregister
    r = client.delete("/v1/devices/fcm-to-delete-001", headers=_h(tok))
    assert r.status_code == 204, r.text


def test_deregister_unknown_token_returns_404():
    """Deregistering a token that does not exist → 404."""
    tok = _register("customer@ziza.dev")
    r = client.delete("/v1/devices/totally-unknown-token-xyz", headers=_h(tok))
    assert r.status_code == 404, r.text
