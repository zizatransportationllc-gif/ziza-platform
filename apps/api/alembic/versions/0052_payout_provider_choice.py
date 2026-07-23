"""Per-payee payout provider choice (stripe | finix) on drivers + professionals.

Lets a driver / professional pick their payout provider at "Set up payouts".
Null → falls back to the global ``settings.payout_provider``.

Revision ID: 0052
Revises: 0051
Create Date: 2026-07-24
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("drivers", sa.Column("payout_provider", sa.String(16), nullable=True))
    op.add_column("professionals", sa.Column("payout_provider", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("professionals", "payout_provider")
    op.drop_column("drivers", "payout_provider")
