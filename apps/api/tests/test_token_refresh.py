"""Sprint 23 — JWT token validation tests (3 tests).

Verifies that:
  - A valid, unexpired token → 200 on a protected endpoint.
  - An expired token → 401.
  - A malformed token → 401.
"""
import time

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

_PROTECTED = "/v1/me"


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_valid_token_returns_200():
    """Fresh token produced by /v1/token must be accepted on a protected route."""
    tok = _tok("customer@ziza.dev")
    r = client.get(_PROTECTED, headers=_h(tok))
    assert r.status_code == 200, r.text


def test_expired_token_returns_401():
    """A hand-crafted JWT with exp in the past must be rejected with 401."""
    import base64
    import json
    import hmac as _hmac
    import hashlib
    from app.config import settings

    # Build an expired JWT using the real signing secret
    header = base64.urlsafe_b64encode(
        json.dumps({"alg": "HS256", "typ": "JWT"}).encode()
    ).rstrip(b"=").decode()

    # exp well in the past
    payload_data = {
        "sub": "customer@ziza.dev",
        "role": "customer",
        "exp": int(time.time()) - 3600,
        "iat": int(time.time()) - 7200,
    }
    payload = base64.urlsafe_b64encode(
        json.dumps(payload_data).encode()
    ).rstrip(b"=").decode()

    signing_input = f"{header}.{payload}".encode()
    sig = _hmac.new(
        settings.jwt_secret.encode(), signing_input, hashlib.sha256
    ).digest()
    signature = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()

    expired_token = f"{header}.{payload}.{signature}"

    r = client.get(_PROTECTED, headers=_h(expired_token))
    assert r.status_code == 401, r.text


def test_malformed_token_returns_401():
    """A completely bogus Bearer value must be rejected with 401."""
    r = client.get(_PROTECTED, headers=_h("not.a.valid.jwt.at.all"))
    assert r.status_code == 401, r.text
