"""0016 — Add driver_locations table (Sprint 22 — real-time GPS tracking).

Revision ID: 0016
Revises: 0015
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "driver_locations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "driver_id",
            sa.String(36),
            sa.ForeignKey("drivers.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("lat", sa.Float, nullable=False),
        sa.Column("lng", sa.Float, nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("driver_id", name="uq_driver_location_driver"),
    )


def downgrade() -> None:
    op.drop_table("driver_locations")
