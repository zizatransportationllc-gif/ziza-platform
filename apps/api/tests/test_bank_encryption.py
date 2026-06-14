"""Sprint 69 — bank account field encryption at rest (Fernet)."""
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

import app.config as _config
import app.crypto as crypto
from app.main import app

client = TestClient(app)
_KEY = Fernet.generate_key().decode()


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


# ---------------------------------------------------------------------------
# Crypto module
# ---------------------------------------------------------------------------

def test_encrypt_decrypt_roundtrip(monkeypatch):
    monkeypatch.setattr(_config.settings, "bank_encryption_key", _KEY, raising=False)
    token = crypto.encrypt("123456789012")
    assert token.startswith("enc:")
    assert "123456789012" not in token
    assert crypto.decrypt(token) == "123456789012"


def test_no_key_passthrough(monkeypatch):
    monkeypatch.setattr(_config.settings, "bank_encryption_key", "", raising=False)
    assert crypto.encrypt("123") == "123"
    assert crypto.decrypt("123") == "123"


def test_decrypt_without_key_raises(monkeypatch):
    monkeypatch.setattr(_config.settings, "bank_encryption_key", _KEY, raising=False)
    token = crypto.encrypt("987654321")
    monkeypatch.setattr(_config.settings, "bank_encryption_key", "", raising=False)
    with pytest.raises(RuntimeError):
        crypto.decrypt(token)


def test_empty_value_passthrough(monkeypatch):
    monkeypatch.setattr(_config.settings, "bank_encryption_key", _KEY, raising=False)
    assert crypto.encrypt("") == ""
    assert crypto.decrypt("") == ""


# ---------------------------------------------------------------------------
# API with encryption enabled — stays masked, never leaks the number
# ---------------------------------------------------------------------------

def test_bank_account_masked_with_encryption_key(monkeypatch):
    monkeypatch.setattr(_config.settings, "bank_encryption_key", _KEY, raising=False)
    t = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(t))
    body = {
        "account_holder_name": "Jane Doe",
        "routing_number": "021000021",
        "account_number": "123456789012",
        "account_type": "checking",
        "country": "US",
    }
    r = client.put("/v1/profile/bank-account", headers=_h(t), json=body)
    assert r.status_code == 200, r.text
    assert r.json()["account_number_last4"] == "9012"
    assert "account_number" not in r.json()
    # Full number must not leak anywhere in the response body
    assert "123456789012" not in r.text

    got = client.get("/v1/profile/bank-account", headers=_h(t))
    assert got.json()["account_number_last4"] == "9012"
    assert "123456789012" not in got.text


def test_prod_requires_encryption_key(monkeypatch):
    """In prod, storing a bank account without an encryption key is refused."""
    # Obtain the token while in dev (the /v1/token endpoint is 404 in prod).
    t = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(t))
    monkeypatch.setattr(_config.settings, "environment", "prod", raising=False)
    monkeypatch.setattr(_config.settings, "bank_encryption_key", "", raising=False)
    r = client.put("/v1/profile/bank-account", headers=_h(t), json={
        "account_holder_name": "Jane Doe",
        "routing_number": "021000021",
        "account_number": "123456789012",
    })
    assert r.status_code == 503
