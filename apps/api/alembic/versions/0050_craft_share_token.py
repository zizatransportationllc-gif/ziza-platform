"""Add craft_requests.share_token — public "share this intervention" link.

Revision ID: 0050
Revises: 0049
Create Date: 2026-07-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0050"
down_revision = "0049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("craft_requests", sa.Column("share_token", sa.String(64), nullable=True))
    op.create_index(
        "ix_craft_requests_share_token",
        "craft_requests",
        ["share_token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_craft_requests_share_token", table_name="craft_requests")
    op.drop_column("craft_requests", "share_token")
