"""WS3 (Sprint 68) — Stripe Connect onboarding + payout processing (driver + pro).

Uses the mock adapters (no Stripe call): the mock Connect account is treated as
fully onboarded so the payout batch can run end-to-end.
"""
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


def _completed_trip(d_tok: str, c_tok: str) -> None:
    est = client.post("/v1/estimate", headers=_h(c_tok), json={
        "origin_lat": 5.3207, "origin_lng": -4.0175, "dest_lat": 5.36, "dest_lng": -3.98,
    }).json()["estimate_id"]
    tid = client.post("/v1/trips", headers=_h(c_tok), json={
        "estimate_id": est, "category": "economy"}).json()["trip_id"]
    client.patch(f"/v1/trips/{tid}/accept", headers=_h(d_tok))
    client.patch(f"/v1/trips/{tid}/start", headers=_h(d_tok))
    assert client.patch(f"/v1/trips/{tid}/complete", headers=_h(d_tok)).status_code == 200


# ---------------------------------------------------------------------------
# Onboarding
# ---------------------------------------------------------------------------

def test_driver_connect_onboard_and_status():
    d_tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(d_tok))
    client.post("/v1/drivers/register", headers=_h(d_tok))

    r = client.post("/v1/payouts/connect/onboard", headers=_h(d_tok))
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["account_id"].startswith("acct_mock_")
    assert data["onboarding_url"]

    st = client.get("/v1/payouts/connect/status", headers=_h(d_tok))
    assert st.status_code == 200
    assert st.json()["onboarded"] is True
    assert st.json()["payouts_enabled"] is True


def test_pro_connect_onboard():
    p_tok = _tok("professional@ziza.dev")
    client.post("/v1/auth/register", headers=_h(p_tok))
    client.post("/v1/craft/professionals/register", headers=_h(p_tok), json={"specialties": "tow"})
    r = client.post("/v1/payouts/connect/onboard", headers=_h(p_tok))
    assert r.status_code == 201, r.text
    assert r.json()["account_id"].startswith("acct_mock_")


def test_connect_onboard_requires_payable_role():
    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))
    assert client.post("/v1/payouts/connect/onboard", headers=_h(c_tok)).status_code == 403


def test_connect_status_before_onboarding():
    d_tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(d_tok))
    client.post("/v1/drivers/register", headers=_h(d_tok))
    st = client.get("/v1/payouts/connect/status", headers=_h(d_tok))
    assert st.status_code == 200
    assert st.json()["account_id"] is None
    assert st.json()["onboarded"] is False


def test_onboarding_self_heals_stale_account(monkeypatch):
    """A stored id Stripe no longer recognizes (mock id from before Stripe went
    live, or a pre-Custom Express account) is dropped and re-provisioned, instead
    of leaving the payee stuck on a dead id."""
    from app.payment import stripe_connect

    d_tok = _tok("driver@ziza.dev")
    client.post("/v1/auth/register", headers=_h(d_tok))
    client.post("/v1/drivers/register", headers=_h(d_tok))

    first = client.post("/v1/payouts/connect/onboard", headers=_h(d_tok)).json()["account_id"]

    # Simulate Stripe rejecting the stored id → onboarding must mint a fresh one.
    monkeypatch.setattr(stripe_connect, "account_exists", lambda _acct: False)
    monkeypatch.setattr(stripe_connect, "create_connected_account", lambda _email: "acct_fresh_123")

    r = client.post("/v1/payouts/connect/onboard", headers=_h(d_tok))
    assert r.status_code == 201, r.text
    assert r.json()["account_id"] == "acct_fresh_123"
    assert r.json()["account_id"] != first


# ---------------------------------------------------------------------------
# Driver payout batch requires a connected account
# ---------------------------------------------------------------------------

def test_driver_payout_fails_without_connected_account():
    d_tok = _tok("driver@ziza.dev")
    a_tok = _tok("admin@ziza.dev")
    c_tok = _tok("customer@ziza.dev")
    for t in (d_tok, a_tok, c_tok):
        client.post("/v1/auth/register", headers=_h(t))
    client.post("/v1/drivers/register", headers=_h(d_tok))
    _completed_trip(d_tok, c_tok)

    avail = client.get("/v1/drivers/me/balance", headers=_h(d_tok)).json()["disponible_cents"]
    pid = client.post("/v1/drivers/me/payout-requests", headers=_h(d_tok),
                      json={"amount_cents": min(avail, 100)}).json()["payout_id"]
    client.patch(f"/v1/admin/payout-requests/{pid}/status", headers=_h(a_tok),
                 json={"status": "approved"})
    # No onboarding → batch cannot transfer → marked failed, not processed.
    r = client.post("/v1/admin/payouts/run", headers=_h(a_tok))
    assert r.status_code == 200
    assert r.json()["failed"] >= 1


# ---------------------------------------------------------------------------
# Professional payout — end to end
# ---------------------------------------------------------------------------

def _pro_with_earnings(price_cents: int = 50_000) -> str:
    p_tok = _tok("professional@ziza.dev")
    client.post("/v1/auth/register", headers=_h(p_tok))
    client.post("/v1/craft/professionals/register", headers=_h(p_tok), json={"specialties": "tow"})
    client.post("/v1/payouts/connect/onboard", headers=_h(p_tok))  # mock-onboarded

    c_tok = _tok("customer@ziza.dev")
    client.post("/v1/auth/register", headers=_h(c_tok))
    rid = client.post("/v1/craft/requests", headers=_h(c_tok), json={
        "category": "tow", "description": "Flat tyre", "lat": 5.32, "lng": -4.01}).json()["request_id"]
    bid_id = client.post(f"/v1/craft/requests/{rid}/bids", headers=_h(p_tok), json={
        "price_cents": price_cents, "eta_min": 20}).json()["bid_id"]
    client.post(f"/v1/craft/requests/{rid}/select", headers=_h(c_tok), json={"bid_id": bid_id})
    return p_tok


def test_professional_payout_end_to_end():
    p_tok = _pro_with_earnings(50_000)
    a_tok = _tok("admin@ziza.dev")
    client.post("/v1/auth/register", headers=_h(a_tok))

    pid = client.post("/v1/craft/professionals/me/payout-requests", headers=_h(p_tok),
                      json={"amount_cents": 20_000}).json()["payout_id"]

    # Admin sees it
    listing = client.get("/v1/admin/professional-payout-requests", headers=_h(a_tok))
    assert listing.status_code == 200
    assert any(p["payout_id"] == pid for p in listing.json())

    # Approve + run the batch → processed
    upd = client.patch(f"/v1/admin/professional-payout-requests/{pid}/status",
                       headers=_h(a_tok), json={"status": "approved"})
    assert upd.status_code == 200 and upd.json()["status"] == "approved"

    run = client.post("/v1/admin/professional-payouts/run", headers=_h(a_tok))
    assert run.status_code == 200, run.text
    assert run.json()["processed"] >= 1
    assert run.json()["failed"] == 0


def test_admin_pro_payout_endpoints_require_admin():
    p_tok = _tok("professional@ziza.dev")
    client.post("/v1/auth/register", headers=_h(p_tok))
    assert client.get("/v1/admin/professional-payout-requests", headers=_h(p_tok)).status_code == 403
    assert client.post("/v1/admin/professional-payouts/run", headers=_h(p_tok)).status_code == 403
