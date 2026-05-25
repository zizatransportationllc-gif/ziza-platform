"""0011 — Add name/phone to users + platform_settings table (Sprint 16).

Revision ID: 0011
Revises: 0010
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add optional profile fields to users
    op.add_column("users", sa.Column("name", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("phone", sa.String(32), nullable=True))

    # Create key-value store for dynamic platform configuration
    op.create_table(
        "platform_settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.Text, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("platform_settings")
    op.drop_column("users", "phone")
    op.drop_column("users", "name")
