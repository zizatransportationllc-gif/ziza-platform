"""0015 — Add category column to vehicles and trips (Sprint 21).

Revision ID: 0015
Revises: 0014
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vehicles",
        sa.Column(
            "category",
            sa.String(32),
            nullable=False,
            server_default="economy",
        ),
    )
    op.add_column(
        "trips",
        sa.Column(
            "category",
            sa.String(32),
            nullable=False,
            server_default="economy",
        ),
    )


def downgrade() -> None:
    op.drop_column("trips", "category")
    op.drop_column("vehicles", "category")
