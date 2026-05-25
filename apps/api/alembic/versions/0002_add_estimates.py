"""Add estimates table

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-25 00:00:00.000000 UTC
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "estimates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("origin_lat", sa.Float(), nullable=False),
        sa.Column("origin_lng", sa.Float(), nullable=False),
        sa.Column("dest_lat", sa.Float(), nullable=False),
        sa.Column("dest_lng", sa.Float(), nullable=False),
        sa.Column("distance_km", sa.Float(), nullable=False),
        sa.Column("duration_min", sa.Integer(), nullable=False),
        sa.Column("fare_xof", sa.Integer(), nullable=False),
        sa.Column("surge_multiplier", sa.Float(), nullable=False),
        sa.Column("distance_source", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_estimates_user_id", "estimates", ["user_id"])
    op.create_index("ix_estimates_expires_at", "estimates", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_estimates_expires_at", table_name="estimates")
    op.drop_index("ix_estimates_user_id", table_name="estimates")
    op.drop_table("estimates")
