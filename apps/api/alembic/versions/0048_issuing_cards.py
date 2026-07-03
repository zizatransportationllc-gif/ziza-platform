"""Stripe Issuing debit cards for driver/professional payees — Sprint 70.

Revision ID: 0048
Revises: 0047
Create Date: 2026-07-03
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0048"
down_revision = "0047"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "issuing_cards",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("owner_role", sa.String(16), nullable=False),
        sa.Column("stripe_cardholder_id", sa.String(128), nullable=False),
        sa.Column("stripe_card_id", sa.String(128), nullable=False),
        sa.Column("last4", sa.String(4), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", name="uq_issuing_cards_user_id"),
    )
    op.create_index("ix_issuing_cards_user_id", "issuing_cards", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_issuing_cards_user_id", table_name="issuing_cards")
    op.drop_table("issuing_cards")
