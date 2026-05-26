"""Sprint 25 — Refresh token & logout tests (12 tests).

Covers:
  - /v1/token     → includes refresh_token + expires_in
  - /v1/auth/refresh → returns new token pair, rotates old token
  - /v1/auth/logout  → revokes refresh token, 404 if unknown
  - full refresh cycle end-to-end
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _login(email: str = "customer@ziza.dev") -> dict:
    """Return the full /v1/token response body."""
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# /v1/token — Sprint 25 additions
# ---------------------------------------------------------------------------

def test_token_endpoint_includes_refresh_token():
    """/v1/token response must contain a non-empty refresh_token."""
    data = _login()
    assert "refresh_token" in data
    assert data["refresh_token"] is not None
    assert len(data["refresh_token"]) > 10


def test_token_endpoint_includes_expires_in():
    """/v1/token response must include expires_in (seconds, > 0)."""
    data = _login()
    assert "expires_in" in data
    assert isinstance(data["expires_in"], int)
    assert data["expires_in"] > 0


# ---------------------------------------------------------------------------
# POST /v1/auth/refresh
# ---------------------------------------------------------------------------

def test_refresh_valid_returns_200():
    """A valid refresh token → HTTP 200."""
    data = _login()
    r = client.post("/v1/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert r.status_code == 200, r.text


def test_refresh_returns_new_access_token():
    """Refresh returns a non-empty access_token."""
    data = _login()
    r = client.post("/v1/auth/refresh", json={"refresh_token": data["refresh_token"]})
    body = r.json()
    assert "access_token" in body
    assert len(body["access_token"]) > 10


def test_refresh_returns_new_refresh_token():
    """Refresh returns a new (different) refresh_token."""
    data = _login()
    old_refresh = data["refresh_token"]
    r = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh})
    body = r.json()
    assert "refresh_token" in body
    new_refresh = body["refresh_token"]
    assert new_refresh is not None
    assert new_refresh != old_refresh


def test_refresh_rotates_old_token_invalid():
    """After rotation the old refresh token must be rejected with 401."""
    data = _login()
    old_refresh = data["refresh_token"]

    # First refresh — consumes old_refresh
    r1 = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r1.status_code == 200, r1.text

    # Re-using the old token must fail
    r2 = client.post("/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r2.status_code == 401, r2.text


def test_refresh_unknown_token_returns_401():
    """An unknown / random refresh token → 401."""
    r = client.post("/v1/auth/refresh", json={"refresh_token": "totally-unknown-token-xyz"})
    assert r.status_code == 401, r.text


def test_refresh_malformed_token_returns_401():
    """An empty-string refresh token → 401."""
    r = client.post("/v1/auth/refresh", json={"refresh_token": ""})
    assert r.status_code == 401, r.text


def test_refresh_missing_body_returns_422():
    """Calling /v1/auth/refresh with no body → 422 validation error."""
    r = client.post("/v1/auth/refresh")
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# POST /v1/auth/logout
# ---------------------------------------------------------------------------

def test_logout_succeeds():
    """Logout with a valid refresh token → 204 No Content."""
    data = _login()
    r = client.post("/v1/auth/logout", json={"refresh_token": data["refresh_token"]})
    assert r.status_code == 204, r.text


def test_logout_revokes_refresh_token():
    """After logout the same refresh token must be rejected by /v1/auth/refresh."""
    data = _login()
    rt = data["refresh_token"]

    # Logout
    lo = client.post("/v1/auth/logout", json={"refresh_token": rt})
    assert lo.status_code == 204, lo.text

    # Attempt refresh — should fail
    r = client.post("/v1/auth/refresh", json={"refresh_token": rt})
    assert r.status_code == 401, r.text


# ---------------------------------------------------------------------------
# Full cycle
# ---------------------------------------------------------------------------

def test_full_refresh_cycle():
    """Full token lifecycle: login → refresh → use new token → logout."""
    # 1. Obtain initial token pair
    data = _login("driver@ziza.dev")
    access1 = data["access_token"]
    refresh1 = data["refresh_token"]

    # 2. Verify the access token works
    me = client.get("/v1/me", headers=_h(access1))
    assert me.status_code == 200, me.text

    # 3. Refresh: obtain new pair
    r = client.post("/v1/auth/refresh", json={"refresh_token": refresh1})
    assert r.status_code == 200, r.text
    body2 = r.json()
    access2 = body2["access_token"]
    refresh2 = body2["refresh_token"]

    # 4. Old access token may still be valid (JWT TTL), but new access token works
    me2 = client.get("/v1/me", headers=_h(access2))
    assert me2.status_code == 200, me2.text

    # 5. Logout with new refresh token
    lo = client.post("/v1/auth/logout", json={"refresh_token": refresh2})
    assert lo.status_code == 204, lo.text

    # 6. After logout, refresh2 must not work
    r2 = client.post("/v1/auth/refresh", json={"refresh_token": refresh2})
    assert r2.status_code == 401, r2.text
