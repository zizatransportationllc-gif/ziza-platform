"""Add trips.origin_address / dest_address — the address text the customer
entered at booking, shown to the driver.

Revision ID: 0042
Revises: 0041
Create Date: 2026-06-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0042"
down_revision = "0041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("origin_address", sa.String(255), nullable=True))
    op.add_column("trips", sa.Column("dest_address", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("trips", "dest_address")
    op.drop_column("trips", "origin_address")
