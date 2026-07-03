"""Sprint 70 — payment split engine + admin settings tests.

Covers the pure calculation (app/payment/split.py) with the worked examples from
docs/plans/2026-07-03-payment-split-redesign.md, rounding and invariants, plus
the admin GET/PATCH /v1/admin/settings/payments endpoints.
"""
import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.payment.split import (
    PaymentConfig,
    compute_craft_split,
    compute_ride_split,
    estimate_stripe_fee,
)

client = TestClient(app)


def _cfg(**overrides) -> PaymentConfig:
    base = PaymentConfig.from_settings(settings)
    return PaymentConfig(**{**base.__dict__, **overrides})


# ---------------------------------------------------------------------------
# Ride split
# ---------------------------------------------------------------------------

def test_ride_split_worked_example():
    # D=2000, T=50, total=2050, F=round(59.45)+30=89, net=1911, driver=955
    s = compute_ride_split(2000, _cfg())
    assert s.base_cents == 2000
    assert s.tax_cents == 50
    assert s.total_client_cents == 2050
    assert s.stripe_fee_est_cents == 89
    assert s.driver_amount_cents == 955
    assert s.platform_amount_cents == 2050 - 955


def test_ride_split_invariant_and_positive():
    for fare in (100, 250, 999, 2000, 12345, 100_000):
        s = compute_ride_split(fare, _cfg())
        assert s.driver_amount_cents + s.platform_amount_cents == s.total_client_cents
        assert s.driver_amount_cents >= 0
        assert s.platform_amount_cents >= 0


def test_ride_split_respects_split_pct():
    s = compute_ride_split(2000, _cfg(ride_driver_split_pct=40))
    net = 2000 - s.stripe_fee_est_cents
    assert s.driver_amount_cents == net * 40 // 100


def test_ride_split_rejects_nonpositive():
    with pytest.raises(ValueError):
        compute_ride_split(0, _cfg())


# ---------------------------------------------------------------------------
# Craft split
# ---------------------------------------------------------------------------

def test_craft_split_worked_example():
    # B=8000, fee=800, T=530, total=9330, F=round(270.57)+30=301, pro=8000
    s = compute_craft_split(8000, _cfg())
    assert s.base_cents == 8000
    assert s.platform_fee_cents == 800
    assert s.tax_cents == 530
    assert s.total_client_cents == 9330
    assert s.stripe_fee_est_cents == 301
    assert s.pro_amount_cents == 8000
    assert s.platform_amount_cents == 1330


def test_craft_split_invariant():
    for bid in (500, 3000, 8000, 55555, 100_000):
        s = compute_craft_split(bid, _cfg())
        assert s.pro_amount_cents + s.platform_amount_cents == s.total_client_cents
        assert s.pro_amount_cents == bid
        assert s.platform_amount_cents == s.platform_fee_cents + s.tax_cents


def test_craft_split_rejects_nonpositive():
    with pytest.raises(ValueError):
        compute_craft_split(-1, _cfg())


def test_estimate_stripe_fee_formula():
    cfg = _cfg(stripe_fee_pct=2.9, stripe_fee_fixed_cents=30)
    assert estimate_stripe_fee(1000, cfg) == round(29.0) + 30


# ---------------------------------------------------------------------------
# Admin settings endpoint
# ---------------------------------------------------------------------------

def _token(email: str) -> str:
    # Password comes from settings (shared dev password) — no hardcoded literal.
    resp = client.post("/v1/token", json={"email": email, "password": settings.auth_dev_password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def test_admin_payment_settings_get_defaults():
    tok = _token("admin@ziza.dev")
    resp = client.get(
        "/v1/admin/settings/payments",
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ride_tax_flat_cents"] == settings.ride_tax_flat_cents
    assert body["craft_tax_pct"] == settings.craft_tax_pct


def test_admin_payment_settings_patch_roundtrip():
    tok = _token("admin@ziza.dev")
    resp = client.patch(
        "/v1/admin/settings/payments",
        json={"ride_tax_flat_cents": 75, "craft_tax_pct": 7.0},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ride_tax_flat_cents"] == 75
    assert body["craft_tax_pct"] == 7.0
    # unspecified keys keep their prior value
    assert body["craft_platform_fee_pct"] == settings.craft_platform_fee_pct
    # reset to default so other tests are not affected
    client.patch(
        "/v1/admin/settings/payments",
        json={"ride_tax_flat_cents": settings.ride_tax_flat_cents,
              "craft_tax_pct": settings.craft_tax_pct},
        headers={"Authorization": f"Bearer {tok}"},
    )


def test_admin_payment_settings_validation():
    tok = _token("admin@ziza.dev")
    resp = client.patch(
        "/v1/admin/settings/payments",
        json={"craft_tax_pct": 150},
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert resp.status_code == 422, resp.text


def test_admin_payment_settings_requires_admin():
    tok = _token("customer@ziza.dev")
    resp = client.get(
        "/v1/admin/settings/payments",
        headers={"Authorization": f"Bearer {tok}"},
    )
    assert resp.status_code == 403, resp.text
