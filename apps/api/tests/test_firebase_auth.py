from fastapi.testclient import TestClient
from app.main import app
from app.auth.base import Claims
import app.auth.firebase_adapter as fb

client = TestClient(app)


def _mock(monkeypatch):
    # token "valid:<email>" -> identité simulée (uid = fb_<email>)
    def _fake_verify(self, token):
        email = token.split(":", 1)[1]
        return Claims(user_id=f"fb_{email}", email=email, role="customer", provider="firebase")
    monkeypatch.setattr(fb.FirebaseAdapter, "__init__", lambda self: None)
    monkeypatch.setattr(fb.FirebaseAdapter, "verify", _fake_verify)


def test_new_driver_gets_role(monkeypatch):
    _mock(monkeypatch)
    r = client.post("/v1/auth/firebase", json={"id_token": "valid:d@x.io", "role": "driver"})
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_admin_requires_code(monkeypatch):
    _mock(monkeypatch)
    r = client.post("/v1/auth/firebase", json={"id_token": "valid:a@x.io", "role": "admin"})
    assert r.status_code == 403


def test_admin_with_code_ok(monkeypatch):
    _mock(monkeypatch)
    r = client.post("/v1/auth/firebase",
                    json={"id_token": "valid:a@x.io", "role": "admin", "admin_code": "ZIZA-ADMIN-2024"})
    assert r.status_code == 200


def test_invalid_role_422(monkeypatch):
    _mock(monkeypatch)
    r = client.post("/v1/auth/firebase", json={"id_token": "valid:x@x.io", "role": "wizard"})
    assert r.status_code == 422


def test_existing_user_role_not_escalated(monkeypatch):
    _mock(monkeypatch)
    # 1er login: customer
    client.post("/v1/auth/firebase", json={"id_token": "valid:c@x.io", "role": "customer"})
    # 2e login en tentant role=admin -> doit rester customer
    r = client.post("/v1/auth/firebase", json={"id_token": "valid:c@x.io", "role": "admin"})
    assert r.status_code == 200
    token = r.json()["access_token"]
    # PREUVE: /v1/me avec ce token renvoie role customer (pas admin)
    me = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["role"] == "customer"
