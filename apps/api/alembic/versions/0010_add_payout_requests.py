"""Add payout_requests table.

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-25
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "payout_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "driver_id",
            sa.Uuid(),
            sa.ForeignKey("drivers.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("amount_xof", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("note_admin", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("payout_requests")
