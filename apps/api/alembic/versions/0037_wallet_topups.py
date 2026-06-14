"""Wallet top-ups table — WS2 (Sprint 68).

Real wallet top-ups paid via the payment provider; the wallet is credited only
on webhook confirmation.

Revision ID: 0037
Revises: 0036
Create Date: 2026-06-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wallet_topups",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False, server_default="USD"),
        sa.Column("provider", sa.String(32), nullable=False, server_default="mock"),
        sa.Column("provider_ref", sa.String(128), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("checkout_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_wallet_topups_user_id", "wallet_topups", ["user_id"])
    op.create_index("ix_wallet_topups_provider_ref", "wallet_topups", ["provider_ref"])


def downgrade() -> None:
    op.drop_index("ix_wallet_topups_provider_ref", table_name="wallet_topups")
    op.drop_index("ix_wallet_topups_user_id", table_name="wallet_topups")
    op.drop_table("wallet_topups")
