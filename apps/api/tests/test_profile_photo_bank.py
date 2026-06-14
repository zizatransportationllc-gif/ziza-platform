"""Sprint 69 — profile photo + bank account (customer / driver / professional)."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _user(email: str) -> str:
    t = _tok(email)
    client.post("/v1/auth/register", headers=_h(t))
    return t


# ---------------------------------------------------------------------------
# Profile photo
# ---------------------------------------------------------------------------

def test_avatar_upload_url_and_set():
    t = _user("customer@ziza.dev")
    r = client.post("/v1/profile/avatar-upload-url", headers=_h(t),
                    json={"filename": "me.jpg", "content_type": "image/jpeg"})
    assert r.status_code == 200, r.text
    final_url = r.json()["final_url"]
    assert r.json()["upload_url"]

    # Save it on the profile
    upd = client.patch("/v1/profile", headers=_h(t), json={"avatar_url": final_url})
    assert upd.status_code == 200
    # In dev (no bucket) the signed read URL is the stored value unchanged
    assert upd.json()["avatar_url"] == final_url
    assert client.get("/v1/profile", headers=_h(t)).json()["avatar_url"] == final_url


def test_avatar_upload_url_rejects_non_image():
    t = _user("driver@ziza.dev")
    r = client.post("/v1/profile/avatar-upload-url", headers=_h(t),
                    json={"filename": "x.exe", "content_type": "application/octet-stream"})
    assert r.status_code == 422


def test_avatar_requires_auth():
    r = client.post("/v1/profile/avatar-upload-url", json={"filename": "x.jpg"})
    assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Bank account (works for any role)
# ---------------------------------------------------------------------------

def _valid_bank():
    return {
        "account_holder_name": "Jane Doe",
        "routing_number": "021000021",
        "account_number": "123456789012",
        "bank_name": "Wells Fargo",
        "account_type": "checking",
        "country": "US",
    }


@pytest.mark.parametrize("email", ["customer@ziza.dev", "driver@ziza.dev", "professional@ziza.dev"])
def test_bank_account_set_and_get_masked(email):
    t = _user(email)
    r = client.put("/v1/profile/bank-account", headers=_h(t), json=_valid_bank())
    assert r.status_code == 200, r.text
    data = r.json()
    # Masked: only last 4, never the full number
    assert data["account_number_last4"] == "9012"
    assert "account_number" not in data
    assert data["account_holder_name"] == "Jane Doe"

    got = client.get("/v1/profile/bank-account", headers=_h(t))
    assert got.status_code == 200
    assert got.json()["account_number_last4"] == "9012"
    assert "account_number" not in got.json()


def test_bank_account_get_before_set_404():
    t = _user("customer@ziza.dev")
    assert client.get("/v1/profile/bank-account", headers=_h(t)).status_code == 404


def test_bank_account_replace_updates_last4():
    t = _user("driver@ziza.dev")
    client.put("/v1/profile/bank-account", headers=_h(t), json=_valid_bank())
    body = _valid_bank()
    body["account_number"] = "999988887777"
    r = client.put("/v1/profile/bank-account", headers=_h(t), json=body)
    assert r.json()["account_number_last4"] == "7777"


def test_bank_account_invalid_inputs():
    t = _user("customer@ziza.dev")
    bad = _valid_bank(); bad["account_number"] = "12"
    assert client.put("/v1/profile/bank-account", headers=_h(t), json=bad).status_code == 422
    bad2 = _valid_bank(); bad2["account_type"] = "crypto"
    assert client.put("/v1/profile/bank-account", headers=_h(t), json=bad2).status_code == 422


def test_bank_account_requires_auth():
    assert client.get("/v1/profile/bank-account").status_code in (401, 403)
