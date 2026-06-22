"""Craft payments — reuse payment_intents for assistance jobs.

- payment_intents.trip_id becomes nullable; add craft_request_id (nullable, unique).
- craft_requests.paid_at to stamp confirmed payment.

Revision ID: 0045
Revises: 0044
Create Date: 2026-06-22
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("payment_intents", "trip_id", existing_type=sa.Uuid(), nullable=True)
    op.add_column("payment_intents", sa.Column("craft_request_id", sa.Uuid(), nullable=True))
    op.create_unique_constraint("uq_payment_intents_craft_request_id", "payment_intents", ["craft_request_id"])
    op.create_foreign_key(
        "fk_payment_intents_craft_request_id", "payment_intents", "craft_requests",
        ["craft_request_id"], ["id"], ondelete="CASCADE",
    )
    op.add_column("craft_requests", sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("craft_requests", "paid_at")
    op.drop_constraint("fk_payment_intents_craft_request_id", "payment_intents", type_="foreignkey")
    op.drop_constraint("uq_payment_intents_craft_request_id", "payment_intents", type_="unique")
    op.drop_column("payment_intents", "craft_request_id")
    op.alter_column("payment_intents", "trip_id", existing_type=sa.Uuid(), nullable=False)
