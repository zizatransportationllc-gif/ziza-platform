"""0023 — Commission settings + payout batch columns (Sprint 29).

Changes:
  1. Create new ``commission_settings`` table.
  2. Add batch-payout columns to existing ``payout_requests`` table:
       commission_xof, net_amount_xof, provider_ref, processed_at

Revision ID: 0023
Revises: 0022
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Create commission_settings table
    # ------------------------------------------------------------------
    op.create_table(
        "commission_settings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "category",
            sa.String(32),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "rate_pct",
            sa.Integer(),
            nullable=False,
            server_default="15",
        ),
        sa.Column(
            "effective_from",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "created_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_commission_settings_category",
        "commission_settings",
        ["category"],
        unique=True,
    )

    # ------------------------------------------------------------------
    # 2. Extend payout_requests with batch-payout columns
    # ------------------------------------------------------------------
    op.add_column(
        "payout_requests",
        sa.Column("commission_xof", sa.Integer(), nullable=True),
    )
    op.add_column(
        "payout_requests",
        sa.Column("net_amount_xof", sa.Integer(), nullable=True),
    )
    op.add_column(
        "payout_requests",
        sa.Column("provider_ref", sa.String(128), nullable=True),
    )
    op.add_column(
        "payout_requests",
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("payout_requests", "processed_at")
    op.drop_column("payout_requests", "provider_ref")
    op.drop_column("payout_requests", "net_amount_xof")
    op.drop_column("payout_requests", "commission_xof")

    op.drop_index("ix_commission_settings_category", table_name="commission_settings")
    op.drop_table("commission_settings")
