"""Payment split engine — Sprint 70.

Pure, side-effect-free computation of how a customer payment is divided between
the payee (driver / professional) and Ziza, and how much Stripe is estimated to
take. No I/O — callers pass a :class:`PaymentConfig` (built from settings +
admin overrides in ``crud.load_payment_config``).

Design (validated with product):

Ride-share
  - ``fare_cents`` (``D``) is the price the customer already sees (economy base ×
    category multiplier, applied in ``crud``).  A flat per-ride tax/levy ``T`` is
    added on top.  Stripe's estimated fee ``F`` is subtracted from the pre-tax
    amount, then the remainder is split driver/Ziza per ``ride_driver_split_pct``.

Road-side (craft)
  - ``bid_cents`` (``B``) is the winning bid.  The customer pays ``B`` + a
    platform fee (``craft_platform_fee_pct`` of ``B``) + sales tax
    (``craft_tax_pct`` of ``B``).  The professional receives 100 % of the bid;
    Ziza keeps the fee + tax (Stripe's fee comes out of Ziza's balance).

Invariant (both):  ``payee_amount + platform_amount == total_client_cents``.
Stripe deducts ``F`` from the *platform* balance in a destination charge, so the
payee receives exactly ``payee_amount``; Ziza's real margin is
``platform_amount − stripe_fee_est − tax_remitted``.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PaymentConfig:
    """Tunable rates for the split engine (defaults from settings, overridable)."""

    ride_tax_flat_cents: int
    ride_driver_split_pct: int
    craft_platform_fee_pct: float
    craft_tax_pct: float
    stripe_fee_pct: float
    stripe_fee_fixed_cents: int

    @classmethod
    def from_settings(cls, settings) -> "PaymentConfig":
        return cls(
            ride_tax_flat_cents=settings.ride_tax_flat_cents,
            ride_driver_split_pct=settings.ride_driver_split_pct,
            craft_platform_fee_pct=settings.craft_platform_fee_pct,
            craft_tax_pct=settings.craft_tax_pct,
            stripe_fee_pct=settings.stripe_fee_pct,
            stripe_fee_fixed_cents=settings.stripe_fee_fixed_cents,
        )


@dataclass(frozen=True)
class RideSplit:
    """Breakdown of a ride-share payment (all amounts in USD cents)."""

    base_cents: int          # fare shown to the customer (pre-tax)
    tax_cents: int           # flat per-ride levy
    total_client_cents: int  # what the customer is charged
    stripe_fee_est_cents: int
    driver_amount_cents: int  # transferred to the driver's Connect account
    platform_amount_cents: int  # Ziza's application_fee_amount (incl. tax to remit)


@dataclass(frozen=True)
class CraftSplit:
    """Breakdown of a road-side (craft) payment (all amounts in USD cents)."""

    base_cents: int          # winning bid
    platform_fee_cents: int  # Ziza processing fee on top of the bid
    tax_cents: int           # sales tax
    total_client_cents: int  # what the customer is charged
    stripe_fee_est_cents: int
    pro_amount_cents: int     # transferred to the professional (100 % of the bid)
    platform_amount_cents: int  # Ziza's application_fee_amount (fee + tax)


def estimate_stripe_fee(total_cents: int, cfg: PaymentConfig) -> int:
    """Estimate Stripe's processing fee on a charge of ``total_cents``.

    ``round(pct% × total) + fixed``. Reconciled later against the real
    ``balance_transaction`` fee (Phase G).
    """
    return round(total_cents * cfg.stripe_fee_pct / 100) + cfg.stripe_fee_fixed_cents


def compute_ride_split(fare_cents: int, cfg: PaymentConfig) -> RideSplit:
    """Split a ride payment. ``fare_cents`` is the (post-multiplier) fare."""
    if fare_cents <= 0:
        raise ValueError("fare_cents must be positive")
    tax = cfg.ride_tax_flat_cents
    total = fare_cents + tax
    fee = estimate_stripe_fee(total, cfg)
    net = fare_cents - fee
    driver = max(0, net) * cfg.ride_driver_split_pct // 100
    platform = total - driver
    return RideSplit(
        base_cents=fare_cents,
        tax_cents=tax,
        total_client_cents=total,
        stripe_fee_est_cents=fee,
        driver_amount_cents=driver,
        platform_amount_cents=platform,
    )


def compute_craft_split(bid_cents: int, cfg: PaymentConfig) -> CraftSplit:
    """Split a road-side payment. ``bid_cents`` is the winning bid."""
    if bid_cents <= 0:
        raise ValueError("bid_cents must be positive")
    platform_fee = round(bid_cents * cfg.craft_platform_fee_pct / 100)
    tax = round(bid_cents * cfg.craft_tax_pct / 100)
    total = bid_cents + platform_fee + tax
    fee = estimate_stripe_fee(total, cfg)
    pro = bid_cents
    platform = total - pro
    return CraftSplit(
        base_cents=bid_cents,
        platform_fee_cents=platform_fee,
        tax_cents=tax,
        total_client_cents=total,
        stripe_fee_est_cents=fee,
        pro_amount_cents=pro,
        platform_amount_cents=platform,
    )
