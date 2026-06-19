"""Add trips.verification_code — short per-trip code shared by customer & driver.

Revision ID: 0041
Revises: 0040
Create Date: 2026-06-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0041"
down_revision = "0040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("verification_code", sa.String(8), nullable=True))


def downgrade() -> None:
    op.drop_column("trips", "verification_code")
