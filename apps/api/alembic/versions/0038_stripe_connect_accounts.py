"""Stripe Connect account id on drivers + professionals — WS3 (Sprint 68).

Revision ID: 0038
Revises: 0037
Create Date: 2026-06-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("drivers", sa.Column("stripe_account_id", sa.String(128), nullable=True))
    op.add_column("professionals", sa.Column("stripe_account_id", sa.String(128), nullable=True))
    op.add_column("professional_payout_requests", sa.Column("provider_ref", sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column("professional_payout_requests", "provider_ref")
    op.drop_column("professionals", "stripe_account_id")
    op.drop_column("drivers", "stripe_account_id")
