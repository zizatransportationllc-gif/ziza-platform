"""Sprint 24 — /v1/payments/* tests (15 tests).

Coverage:
  - POST /v1/payments/intent  (create intent for completed trip)
  - GET  /v1/payments/{id}    (read intent by id)
  - POST /v1/payments/webhook (confirm / reject payment)
  - GET  /v1/trips/{id}/payment (trip-scoped shortcut)
"""
import json
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_payment_return_url_is_not_the_dead_ci_domain():
    """The post-payment redirect must point at a live customer app, never the
    retired app.ziza.ci domain (regression guard)."""
    from app.config import settings

    assert "ziza.ci" not in settings.payment_return_url
    assert settings.payment_return_url.startswith("https://")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_token(email: str = "customer@ziza.dev") -> str:
    resp = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _register(token: str) -> None:
    resp = client.post(
        "/v1/auth/register",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text


def _register_driver(token: str) -> None:
    resp = client.post(
        "/v1/drivers/register",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text


def _get_estimate(token: str) -> str:
    resp = client.post(
        "/v1/estimate",
        json={
            "origin_lat": 5.3207,
            "origin_lng": -4.0175,
            "dest_lat": 5.3600,
            "dest_lng": -3.9801,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["estimate_id"]


def _onboard_connect(token: str) -> None:
    """Onboard a driver/pro to Stripe Connect (mock account, payouts enabled)."""
    r = client.post("/v1/payouts/connect/onboard", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text


def _completed_trip_id(onboard_driver: bool = True) -> tuple[str, str]:
    """Return (trip_id, customer_token) for a freshly completed trip.

    Sprint 70: the driver is onboarded to Connect by default so the destination
    charge can be created. Pass ``onboard_driver=False`` to exercise the 409 guard.
    """
    token_c = _get_token("customer@ziza.dev")
    token_d = _get_token("driver@ziza.dev")
    _register(token_c)
    _register(token_d)
    _register_driver(token_d)
    if onboard_driver:
        _onboard_connect(token_d)

    estimate_id = _get_estimate(token_c)
    trip_resp = client.post(
        "/v1/trips",
        json={"estimate_id": estimate_id},
        headers={"Authorization": f"Bearer {token_c}"},
    )
    assert trip_resp.status_code == 201, trip_resp.text
    trip_id = trip_resp.json()["trip_id"]

    for action in ("accept", "start", "complete"):
        r = client.patch(
            f"/v1/trips/{trip_id}/{action}",
            headers={"Authorization": f"Bearer {token_d}"},
        )
        assert r.status_code == 200, f"{action}: {r.text}"

    return trip_id, token_c


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# POST /v1/payments/intent
# ---------------------------------------------------------------------------

def test_create_payment_intent_requires_auth() -> None:
    resp = client.post("/v1/payments/intent", json={"trip_id": str(uuid.uuid4())})
    assert resp.status_code in {401, 403}


def test_create_payment_intent_requires_customer_role() -> None:
    token_d = _get_token("driver@ziza.dev")
    _register(token_d)
    resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": str(uuid.uuid4())},
        headers=_auth_header(token_d),
    )
    assert resp.status_code == 403


def test_create_payment_intent_trip_not_completed_returns_422() -> None:
    token_c = _get_token("customer@ziza.dev")
    _register(token_c)
    estimate_id = _get_estimate(token_c)
    trip_resp = client.post(
        "/v1/trips",
        json={"estimate_id": estimate_id},
        headers=_auth_header(token_c),
    )
    assert trip_resp.status_code == 201
    trip_id = trip_resp.json()["trip_id"]

    # Trip is pending — should return 422
    resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": trip_id},
        headers=_auth_header(token_c),
    )
    assert resp.status_code == 422


def test_create_payment_intent_unknown_trip_returns_404() -> None:
    token_c = _get_token("customer@ziza.dev")
    _register(token_c)
    resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": str(uuid.uuid4())},
        headers=_auth_header(token_c),
    )
    assert resp.status_code == 404


def test_create_payment_intent_wrong_customer_returns_403() -> None:
    trip_id, _token_c = _completed_trip_id()
    # A different customer tries to pay for someone else's trip
    token_other = _get_token("admin@ziza.dev")
    _register(token_other)
    resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": trip_id},
        headers=_auth_header(token_other),
    )
    # admin role is not customer → 403 (role guard fires first)
    assert resp.status_code == 403


def test_create_payment_intent_happy_path() -> None:
    trip_id, token_c = _completed_trip_id()
    resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": trip_id},
        headers=_auth_header(token_c),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["intent_id"]
    assert body["trip_id"] == trip_id
    assert body["status"] == "pending"
    assert body["checkout_url"]
    assert body["provider_ref"]
    assert body["amount_cents"] > 0
    assert body["currency"] == "USD"
    # Sprint 70 — split breakdown present and consistent
    assert body["base_cents"] > 0
    assert body["tax_cents"] >= 0
    assert body["amount_cents"] == body["base_cents"] + body["tax_cents"]
    assert body["payee_amount_cents"] + body["platform_amount_cents"] == body["amount_cents"]
    assert body["payee_account_id"].startswith("acct_mock_")


def test_create_payment_intent_driver_not_onboarded_returns_409() -> None:
    """Without a driver Connect account the destination charge is blocked."""
    trip_id, token_c = _completed_trip_id(onboard_driver=False)
    resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": trip_id},
        headers=_auth_header(token_c),
    )
    assert resp.status_code == 409, resp.text


def test_create_payment_intent_idempotent() -> None:
    """Calling twice returns the same intent."""
    trip_id, token_c = _completed_trip_id()
    headers = _auth_header(token_c)

    resp1 = client.post("/v1/payments/intent", json={"trip_id": trip_id}, headers=headers)
    resp2 = client.post("/v1/payments/intent", json={"trip_id": trip_id}, headers=headers)
    assert resp1.status_code == 201
    assert resp2.status_code == 201
    assert resp1.json()["intent_id"] == resp2.json()["intent_id"]


# ---------------------------------------------------------------------------
# GET /v1/payments/{intent_id}
# ---------------------------------------------------------------------------

def test_get_payment_intent_happy_path() -> None:
    trip_id, token_c = _completed_trip_id()
    create_resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": trip_id},
        headers=_auth_header(token_c),
    )
    assert create_resp.status_code == 201
    intent_id = create_resp.json()["intent_id"]

    get_resp = client.get(
        f"/v1/payments/{intent_id}",
        headers=_auth_header(token_c),
    )
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert body["intent_id"] == intent_id
    assert body["status"] == "pending"


def test_get_payment_intent_unknown_returns_404() -> None:
    token_c = _get_token("customer@ziza.dev")
    _register(token_c)
    resp = client.get(
        f"/v1/payments/{uuid.uuid4()}",
        headers=_auth_header(token_c),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /v1/payments/webhook
# ---------------------------------------------------------------------------

def test_webhook_paid_confirms_intent() -> None:
    trip_id, token_c = _completed_trip_id()
    create_resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": trip_id},
        headers=_auth_header(token_c),
    )
    assert create_resp.status_code == 201
    provider_ref = create_resp.json()["provider_ref"]

    hook_resp = client.post(
        "/v1/payments/webhook",
        json={"provider_ref": provider_ref, "status": "paid"},
    )
    assert hook_resp.status_code == 200, hook_resp.text
    body = hook_resp.json()
    assert body["received"] is True
    assert body["status"] == "paid"


def test_webhook_paid_sets_trip_paid_at() -> None:
    trip_id, token_c = _completed_trip_id()
    create_resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": trip_id},
        headers=_auth_header(token_c),
    )
    provider_ref = create_resp.json()["provider_ref"]

    client.post(
        "/v1/payments/webhook",
        json={"provider_ref": provider_ref, "status": "paid"},
    )

    # Verify paid_at is now set on the trip
    trip_resp = client.get(
        f"/v1/trips/{trip_id}",
        headers=_auth_header(token_c),
    )
    assert trip_resp.status_code == 200
    assert trip_resp.json()["paid_at"] is not None


def test_webhook_invalid_payload_returns_400() -> None:
    resp = client.post(
        "/v1/payments/webhook",
        content=b"not-valid-json",
        headers={"Content-Type": "application/octet-stream"},
    )
    assert resp.status_code == 400


def test_webhook_unknown_provider_ref_returns_404() -> None:
    resp = client.post(
        "/v1/payments/webhook",
        json={"provider_ref": "mock-unknown-ref-xyz", "status": "paid"},
    )
    assert resp.status_code == 404


def test_webhook_paid_is_idempotent_on_replay() -> None:
    """WS1: replaying a 'paid' webhook (at-least-once delivery) does not re-stamp."""
    trip_id, token_c = _completed_trip_id()
    provider_ref = client.post(
        "/v1/payments/intent", json={"trip_id": trip_id}, headers=_auth_header(token_c)
    ).json()["provider_ref"]

    first = client.post("/v1/payments/webhook", json={"provider_ref": provider_ref, "status": "paid"})
    assert first.status_code == 200 and first.json()["status"] == "paid"
    paid_at_1 = client.get(f"/v1/trips/{trip_id}", headers=_auth_header(token_c)).json()["paid_at"]

    # Replay the same event
    second = client.post("/v1/payments/webhook", json={"provider_ref": provider_ref, "status": "paid"})
    assert second.status_code == 200 and second.json()["status"] == "paid"
    paid_at_2 = client.get(f"/v1/trips/{trip_id}", headers=_auth_header(token_c)).json()["paid_at"]

    assert paid_at_1 == paid_at_2  # not re-stamped


def test_webhook_failed_after_paid_is_ignored() -> None:
    """WS1: a late 'failed'/'expired' event must not regress a 'paid' intent."""
    trip_id, token_c = _completed_trip_id()
    create = client.post(
        "/v1/payments/intent", json={"trip_id": trip_id}, headers=_auth_header(token_c)
    ).json()
    provider_ref, intent_id = create["provider_ref"], create["intent_id"]

    client.post("/v1/payments/webhook", json={"provider_ref": provider_ref, "status": "paid"})
    late = client.post("/v1/payments/webhook", json={"provider_ref": provider_ref, "status": "failed"})
    assert late.status_code == 200
    # Intent stays paid
    status_now = client.get(f"/v1/payments/{intent_id}", headers=_auth_header(token_c)).json()["status"]
    assert status_now == "paid"


# ---------------------------------------------------------------------------
# GET /v1/trips/{trip_id}/payment
# ---------------------------------------------------------------------------

def test_get_trip_payment_happy_path() -> None:
    trip_id, token_c = _completed_trip_id()
    # Create and confirm intent
    create_resp = client.post(
        "/v1/payments/intent",
        json={"trip_id": trip_id},
        headers=_auth_header(token_c),
    )
    assert create_resp.status_code == 201

    pay_resp = client.get(
        f"/v1/trips/{trip_id}/payment",
        headers=_auth_header(token_c),
    )
    assert pay_resp.status_code == 200
    assert pay_resp.json()["trip_id"] == trip_id
    assert pay_resp.json()["status"] == "pending"


def test_get_trip_payment_no_intent_returns_404() -> None:
    trip_id, token_c = _completed_trip_id()
    # No intent created yet
    resp = client.get(
        f"/v1/trips/{trip_id}/payment",
        headers=_auth_header(token_c),
    )
    assert resp.status_code == 404
