"""Sprint 70 — Stripe Issuing debit cards for driver/professional payees.

Uses the mock adapters (no Stripe call): the mock Connect account is treated as
fully onboarded so a card can be issued end-to-end.
"""
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": settings.auth_dev_password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def _driver(onboard: bool = True) -> str:
    tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/drivers/register", headers=_h(tok))
    if onboard:
        assert client.post("/v1/payouts/connect/onboard", headers=_h(tok)).status_code == 201
    return tok


def _pro(onboard: bool = True) -> str:
    tok = _tok("professional@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    client.post("/v1/craft/professionals/register", headers=_h(tok), json={"specialties": "tow"})
    if onboard:
        assert client.post("/v1/payouts/connect/onboard", headers=_h(tok)).status_code == 201
    return tok


# ---------------------------------------------------------------------------
# Issue
# ---------------------------------------------------------------------------

def test_driver_issue_card():
    tok = _driver()
    r = client.post("/v1/payouts/issuing/card", headers=_h(tok))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["card_id"].startswith("ic_mock_")
    assert body["status"] == "active"
    assert body["owner_role"] == "driver"
    assert len(body["last4"]) == 4


def test_pro_issue_card():
    tok = _pro()
    r = client.post("/v1/payouts/issuing/card", headers=_h(tok))
    assert r.status_code == 201, r.text
    assert r.json()["owner_role"] == "professional"


def test_issue_card_idempotent():
    tok = _driver()
    a = client.post("/v1/payouts/issuing/card", headers=_h(tok)).json()
    b = client.post("/v1/payouts/issuing/card", headers=_h(tok)).json()
    assert a["card_id"] == b["card_id"]


def test_issue_card_requires_onboarding_409():
    tok = _driver(onboard=False)
    r = client.post("/v1/payouts/issuing/card", headers=_h(tok))
    assert r.status_code == 409, r.text


def test_issue_card_requires_payee_role():
    tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(tok))
    r = client.post("/v1/payouts/issuing/card", headers=_h(tok))
    assert r.status_code == 403


def test_issue_card_requires_auth():
    assert client.post("/v1/payouts/issuing/card").status_code == 401


# ---------------------------------------------------------------------------
# Get
# ---------------------------------------------------------------------------

def test_get_card_404_before_issue():
    tok = _driver()
    assert client.get("/v1/payouts/issuing/card", headers=_h(tok)).status_code == 404


def test_get_card_after_issue():
    tok = _driver()
    issued = client.post("/v1/payouts/issuing/card", headers=_h(tok)).json()
    r = client.get("/v1/payouts/issuing/card", headers=_h(tok))
    assert r.status_code == 200
    assert r.json()["card_id"] == issued["card_id"]


# ---------------------------------------------------------------------------
# Freeze / activate
# ---------------------------------------------------------------------------

def test_freeze_and_reactivate_card():
    tok = _driver()
    client.post("/v1/payouts/issuing/card", headers=_h(tok))
    frozen = client.patch("/v1/payouts/issuing/card/status", headers=_h(tok), json={"active": False})
    assert frozen.status_code == 200, frozen.text
    assert frozen.json()["status"] == "inactive"
    active = client.patch("/v1/payouts/issuing/card/status", headers=_h(tok), json={"active": True})
    assert active.json()["status"] == "active"


def test_status_update_without_card_404():
    tok = _driver()
    r = client.patch("/v1/payouts/issuing/card/status", headers=_h(tok), json={"active": False})
    assert r.status_code == 404, r.text
