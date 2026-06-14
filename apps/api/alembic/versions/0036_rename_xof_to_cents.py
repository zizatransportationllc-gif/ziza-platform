"""Rename all *_xof money columns to *_cents (USD cents) — Sprint 68.

The ``_xof`` suffix was a misnomer: every amount is stored in **USD cents**.
This renames the columns to remove any ambiguity. Data is preserved (pure rename).

Revision ID: 0036
Revises: 0035
Create Date: 2026-06-14
"""
from __future__ import annotations

from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None

# (table, old_name, new_name)
_RENAMES = [
    ("estimates", "fare_xof", "fare_cents"),
    ("payment_intents", "amount_xof", "amount_cents"),
    ("trips", "fare_xof", "fare_cents"),
    ("wallets", "balance_xof", "balance_cents"),
    ("wallet_transactions", "amount_xof", "amount_cents"),
    ("payout_requests", "amount_xof", "amount_cents"),
    ("payout_requests", "commission_xof", "commission_cents"),
    ("payout_requests", "net_amount_xof", "net_amount_cents"),
]


def upgrade() -> None:
    for table, old, new in _RENAMES:
        op.alter_column(table, old, new_column_name=new)


def downgrade() -> None:
    for table, old, new in _RENAMES:
        op.alter_column(table, new, new_column_name=old)
