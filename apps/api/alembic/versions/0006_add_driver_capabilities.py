"""0006 — add driver_capabilities table + eta_min on assistance_requests.

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-25
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. New table: driver_capabilities
    op.create_table(
        "driver_capabilities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("driver_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("driver_id", "type", name="uq_driver_type"),
    )
    op.create_index(
        "ix_driver_capabilities_driver_id",
        "driver_capabilities",
        ["driver_id"],
    )

    # 2. Add eta_min to assistance_requests (nullable — backfill not needed)
    op.add_column(
        "assistance_requests",
        sa.Column("eta_min", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("assistance_requests", "eta_min")
    op.drop_index("ix_driver_capabilities_driver_id", table_name="driver_capabilities")
    op.drop_table("driver_capabilities")
