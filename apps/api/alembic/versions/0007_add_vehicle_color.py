"""0007 — add color column to vehicles.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-25
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vehicles",
        sa.Column("color", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("vehicles", "color")
