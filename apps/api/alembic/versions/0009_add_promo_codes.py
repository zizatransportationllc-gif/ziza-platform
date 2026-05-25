"""Sprint 14 — Add promo_codes table + promo fields on trips.

Revision ID: 0009
Revises:     0008
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New promo_codes table
    op.create_table(
        "promo_codes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("discount_pct", sa.Integer(), nullable=False),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("uses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_promo_code"),
    )
    op.create_index("ix_promo_codes_code", "promo_codes", ["code"], unique=True)

    # New columns on trips
    op.add_column(
        "trips",
        sa.Column("promo_code", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "trips",
        sa.Column("discount_pct", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trips", "discount_pct")
    op.drop_column("trips", "promo_code")
    op.drop_index("ix_promo_codes_code", table_name="promo_codes")
    op.drop_table("promo_codes")
