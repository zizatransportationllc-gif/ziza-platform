"""Payment split breakdown columns on payment_intents — Sprint 70.

Adds the Connect destination-charge breakdown (base, platform fee, tax, estimated
Stripe fee, payee/platform amounts, payee account id). All nullable for backward
compatibility with intents created before the redesign.

Revision ID: 0047
Revises: 0046
Create Date: 2026-07-03
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0047"
down_revision = "0046"
branch_labels = None
depends_on = None


_INT_COLUMNS = (
    "base_cents",
    "platform_fee_cents",
    "tax_cents",
    "stripe_fee_est_cents",
    "payee_amount_cents",
    "platform_amount_cents",
)


def upgrade() -> None:
    for name in _INT_COLUMNS:
        op.add_column("payment_intents", sa.Column(name, sa.Integer(), nullable=True))
    op.add_column(
        "payment_intents", sa.Column("payee_account_id", sa.String(128), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("payment_intents", "payee_account_id")
    for name in reversed(_INT_COLUMNS):
        op.drop_column("payment_intents", name)
