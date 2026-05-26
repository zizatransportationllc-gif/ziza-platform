"""0019 — Add payment_intents table (Sprint 24).

Tracks the lifecycle of a customer payment for a completed trip.

Status flow: pending → paid | failed | refunded

Revision ID: 0019
Revises: 0018
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_intents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "trip_id",
            sa.Uuid(),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("amount_xof", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False, server_default="XOF"),
        sa.Column("provider", sa.String(32), nullable=False, server_default="mock"),
        sa.Column("provider_ref", sa.String(128), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("checkout_url", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index("ix_payment_intents_trip_id", "payment_intents", ["trip_id"])
    op.create_index("ix_payment_intents_provider_ref", "payment_intents", ["provider_ref"])


def downgrade() -> None:
    op.drop_index("ix_payment_intents_provider_ref", table_name="payment_intents")
    op.drop_index("ix_payment_intents_trip_id", table_name="payment_intents")
    op.drop_table("payment_intents")
