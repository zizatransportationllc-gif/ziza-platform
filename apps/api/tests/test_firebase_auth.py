from fastapi.testclient import TestClient
from app.main import app
from app.auth.base import Claims
from app.config import settings
import app.auth.firebase_adapter as fb

client = TestClient(app)


def _mock(monkeypatch):
    # token "valid:<email>" -> identité simulée (uid = fb_<email>, email non vérifié)
    def _fake_verify(self, token):
        email = token.split(":", 1)[1]
        return Claims(user_id=f"fb_{email}", email=email, role="customer", provider="firebase")
    monkeypatch.setattr(fb.FirebaseAdapter, "__init__", lambda self: None)
    monkeypatch.setattr(fb.FirebaseAdapter, "verify", _fake_verify)


def _install(monkeypatch, *, uid, email, verified=False):
    """Install a Firebase verify() returning a fixed identity (uid + email + email_verified)."""
    def _verify(self, token):
        return Claims(user_id=uid, email=email, role="customer",
                      provider="firebase", email_verified=verified)
    monkeypatch.setattr(fb.FirebaseAdapter, "__init__", lambda self: None)
    monkeypatch.setattr(fb.FirebaseAdapter, "verify", _verify)


def _me(token):
    return client.get("/v1/me", headers={"Authorization": f"Bearer {token}"}).json()


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


def test_unverified_email_collision_rejected(monkeypatch):
    # Account A owns clash@x.io (verified at creation).
    _install(monkeypatch, uid="fb_X", email="clash@x.io", verified=True)
    assert client.post("/v1/auth/firebase",
                       json={"id_token": "t", "role": "customer"}).status_code == 200
    # A DIFFERENT uid claims the same e-mail but UNVERIFIED → takeover attempt → 403.
    _install(monkeypatch, uid="fb_Y", email="clash@x.io", verified=False)
    r = client.post("/v1/auth/firebase", json={"id_token": "t", "role": "customer"})
    assert r.status_code == 403


def test_verified_email_links_existing_account(monkeypatch):
    # Account A (uid fb_A) created as a driver, e-mail verified.
    _install(monkeypatch, uid="fb_A", email="link@x.io", verified=True)
    r1 = client.post("/v1/auth/firebase", json={"id_token": "t", "role": "driver"})
    assert r1.status_code == 200
    assert _me(r1.json()["access_token"])["user_id"] == "fb_A"
    # A DIFFERENT uid with the same VERIFIED e-mail logs in AS account A,
    # keeping A's stored role (anti-escalation) — no duplicate account, no 500.
    _install(monkeypatch, uid="fb_B", email="link@x.io", verified=True)
    r2 = client.post("/v1/auth/firebase", json={"id_token": "t", "role": "customer"})
    assert r2.status_code == 200
    me2 = _me(r2.json()["access_token"])
    assert me2["user_id"] == "fb_A"
    assert me2["role"] == "driver"


# ---------------------------------------------------------------------------
# Sprint 67 — e-mail verification gate (prod-only) + verified e-mail change sync
# ---------------------------------------------------------------------------

def test_email_verification_gate_blocks_unverified(monkeypatch):
    # Simulate prod: verification is mandatory.
    monkeypatch.setattr(settings, "require_email_verification", True)
    _install(monkeypatch, uid="fb_ev1", email="ev1@x.io", verified=False)
    r = client.post("/v1/auth/firebase", json={"id_token": "t", "role": "customer"})
    assert r.status_code == 403
    assert r.json()["detail"] == "EMAIL_NOT_VERIFIED"
    # The account is still persisted; once the same uid's e-mail is verified, the
    # exchange succeeds (profile fields entered at signup are preserved).
    _install(monkeypatch, uid="fb_ev1", email="ev1@x.io", verified=True)
    r2 = client.post("/v1/auth/firebase", json={"id_token": "t", "role": "customer"})
    assert r2.status_code == 200
    assert _me(r2.json()["access_token"])["user_id"] == "fb_ev1"


def test_unverified_allowed_when_not_required(monkeypatch):
    # Default (dev/CI): verification off → unverified e-mail logs in fine.
    monkeypatch.setattr(settings, "require_email_verification", False)
    _install(monkeypatch, uid="fb_ev2", email="ev2@x.io", verified=False)
    r = client.post("/v1/auth/firebase", json={"id_token": "t", "role": "customer"})
    assert r.status_code == 200


def test_verified_email_change_syncs(monkeypatch):
    _install(monkeypatch, uid="fb_ec1", email="old-ec1@x.io", verified=True)
    r1 = client.post("/v1/auth/firebase", json={"id_token": "t", "role": "customer"})
    assert r1.status_code == 200
    assert _me(r1.json()["access_token"])["email"] == "old-ec1@x.io"
    # Same uid, new VERIFIED e-mail (verifyBeforeUpdateEmail) → DB syncs.
    _install(monkeypatch, uid="fb_ec1", email="new-ec1@x.io", verified=True)
    r2 = client.post("/v1/auth/firebase", json={"id_token": "t", "role": "customer"})
    assert r2.status_code == 200
    assert _me(r2.json()["access_token"])["email"] == "new-ec1@x.io"


def test_email_change_collision_rejected(monkeypatch):
    _install(monkeypatch, uid="fb_ecA", email="taken-ec@x.io", verified=True)
    assert client.post("/v1/auth/firebase",
                       json={"id_token": "t", "role": "customer"}).status_code == 200
    _install(monkeypatch, uid="fb_ecB", email="own-ec@x.io", verified=True)
    assert client.post("/v1/auth/firebase",
                       json={"id_token": "t", "role": "customer"}).status_code == 200
    # B tries to change to A's e-mail → conflict.
    _install(monkeypatch, uid="fb_ecB", email="taken-ec@x.io", verified=True)
    r = client.post("/v1/auth/firebase", json={"id_token": "t", "role": "customer"})
    assert r.status_code == 409
