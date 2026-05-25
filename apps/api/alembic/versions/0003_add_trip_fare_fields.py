"""Add fare snapshot columns to trips table.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-25 00:00:00.000000 UTC
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("estimate_id", sa.Uuid(), nullable=True))
    op.add_column("trips", sa.Column("fare_xof", sa.Integer(), nullable=True))
    op.add_column("trips", sa.Column("distance_km", sa.Float(), nullable=True))
    op.add_column("trips", sa.Column("duration_min", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("trips", "duration_min")
    op.drop_column("trips", "distance_km")
    op.drop_column("trips", "fare_xof")
    op.drop_column("trips", "estimate_id")
