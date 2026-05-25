"""Sprint 16 — Surge pricing admin control tests."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _reset_surge(admin_tok: str) -> None:
    """Restore surge to 1.0 after a test that changed it."""
    client.patch("/v1/admin/settings/surge", headers=_h(admin_tok), json={"surge_multiplier": 1.0})


# ---------------------------------------------------------------------------
# GET /v1/admin/settings/surge
# ---------------------------------------------------------------------------

def test_get_surge_default_is_1():
    """Surge multiplier defaults to 1.0 when not explicitly set."""
    admin_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(admin_tok))
    # Reset to baseline first (previous tests may have changed it)
    _reset_surge(admin_tok)
    r = client.get("/v1/admin/settings/surge", headers=_h(admin_tok))
    assert r.status_code == 200, r.text
    assert r.json()["surge_multiplier"] == 1.0


def test_admin_get_surge_requires_admin():
    """Non-admin cannot read the surge setting."""
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))
    r = client.get("/v1/admin/settings/surge", headers=_h(c_tok))
    assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# PATCH /v1/admin/settings/surge
# ---------------------------------------------------------------------------

def test_admin_set_surge():
    """Admin can set the surge to a valid value (e.g. 2.5)."""
    admin_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(admin_tok))
    r = client.patch(
        "/v1/admin/settings/surge",
        headers=_h(admin_tok),
        json={"surge_multiplier": 2.5},
    )
    assert r.status_code == 200, r.text
    assert r.json()["surge_multiplier"] == 2.5
    _reset_surge(admin_tok)


def test_admin_set_surge_too_low_returns_422():
    """surge_multiplier below 1.0 is rejected with 422."""
    admin_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(admin_tok))
    r = client.patch(
        "/v1/admin/settings/surge",
        headers=_h(admin_tok),
        json={"surge_multiplier": 0.5},
    )
    assert r.status_code == 422, r.text


def test_admin_set_surge_too_high_returns_422():
    """surge_multiplier above 5.0 is rejected with 422."""
    admin_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(admin_tok))
    r = client.patch(
        "/v1/admin/settings/surge",
        headers=_h(admin_tok),
        json={"surge_multiplier": 5.1},
    )
    assert r.status_code == 422, r.text


def test_admin_patch_surge_requires_admin():
    """Non-admin cannot change the surge setting."""
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))
    r = client.patch(
        "/v1/admin/settings/surge",
        headers=_h(c_tok),
        json={"surge_multiplier": 2.0},
    )
    assert r.status_code == 403, r.text


def test_estimate_reflects_surge():
    """Estimates use the DB surge multiplier set by admin."""
    admin_tok = _tok("admin@ziza.dev")
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(admin_tok))
    client.post("/v1/auth/register", headers=_h(c_tok))

    # Set surge to 2.0
    set_r = client.patch(
        "/v1/admin/settings/surge",
        headers=_h(admin_tok),
        json={"surge_multiplier": 2.0},
    )
    assert set_r.status_code == 200, set_r.text

    # Request an estimate
    est_r = client.post(
        "/v1/estimate",
        headers=_h(c_tok),
        json={
            "origin_lat": 5.35,
            "origin_lng": -4.02,
            "dest_lat": 5.36,
            "dest_lng": -4.03,
        },
    )
    assert est_r.status_code == 200, est_r.text
    assert est_r.json()["surge_multiplier"] == 2.0

    # Restore default
    _reset_surge(admin_tok)
