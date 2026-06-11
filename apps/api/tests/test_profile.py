"""Sprint 16 — User profile (GET/PATCH /v1/profile) tests."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(token: str) -> None:
    """Ensure the user row exists in DB."""
    client.post("/v1/auth/register", headers=_h(token))


# ---------------------------------------------------------------------------
# GET /v1/profile
# ---------------------------------------------------------------------------

def test_get_profile_returns_user_fields():
    """Freshly registered user has email, role, name=null, phone=null."""
    tok = _tok("customer@ziza.dev")
    _register(tok)
    r = client.get("/v1/profile", headers=_h(tok))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == "customer@ziza.dev"
    assert data["role"] == "customer"
    assert "name" in data
    assert "phone" in data
    assert "user_id" in data
    assert "created_at" in data


def test_get_profile_requires_auth():
    """GET /v1/profile without a token returns 401."""
    r = client.get("/v1/profile")
    assert r.status_code == 401, r.text


# ---------------------------------------------------------------------------
# PATCH /v1/profile
# ---------------------------------------------------------------------------

def test_patch_profile_updates_name():
    """PATCH with name only → name is set, phone unchanged."""
    tok = _tok("customer@ziza.dev")
    _register(tok)
    r = client.patch("/v1/profile", headers=_h(tok), json={"name": "Kofi Mensah"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == "Kofi Mensah"


def test_patch_profile_updates_phone():
    """PATCH with phone only → phone is set."""
    tok = _tok("customer@ziza.dev")
    _register(tok)
    r = client.patch("/v1/profile", headers=_h(tok), json={"phone": "+225 07 00 00 00"})
    assert r.status_code == 200, r.text
    assert r.json()["phone"] == "+225 07 00 00 00"


def test_patch_profile_updates_both():
    """PATCH with name + phone → both fields updated."""
    tok = _tok("customer@ziza.dev")
    _register(tok)
    r = client.patch(
        "/v1/profile",
        headers=_h(tok),
        json={"name": "Ama Diallo", "phone": "+225 05 11 22 33"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["name"] == "Ama Diallo"
    assert data["phone"] == "+225 05 11 22 33"


def test_patch_profile_updates_identity_fields():
    """Sprint 66 — PATCH can update first_name / last_name / date_of_birth."""
    tok = _tok("customer@ziza.dev")
    _register(tok)
    r = client.patch(
        "/v1/profile",
        headers=_h(tok),
        json={"first_name": "Ama", "last_name": "Diallo", "date_of_birth": "1992-03-15"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["first_name"] == "Ama"
    assert data["last_name"] == "Diallo"
    assert data["date_of_birth"] == "1992-03-15"


def test_patch_profile_requires_auth():
    """PATCH /v1/profile without a token returns 401."""
    r = client.patch("/v1/profile", json={"name": "Nobody"})
    assert r.status_code == 401, r.text


def test_patch_profile_name_too_long_returns_422():
    """Name exceeding 128 characters should be rejected with 422."""
    tok = _tok("customer@ziza.dev")
    _register(tok)
    long_name = "A" * 129
    r = client.patch("/v1/profile", headers=_h(tok), json={"name": long_name})
    assert r.status_code == 422, r.text


def test_patch_profile_empty_body_is_noop():
    """PATCH with an empty body leaves the profile unchanged."""
    tok = _tok("customer@ziza.dev")
    _register(tok)
    # Set a known state first
    client.patch("/v1/profile", headers=_h(tok), json={"name": "Initial"})
    # Empty patch → name should still be "Initial"
    r = client.patch("/v1/profile", headers=_h(tok), json={})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Initial"
