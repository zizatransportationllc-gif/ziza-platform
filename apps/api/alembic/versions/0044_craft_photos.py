"""Add craft_photos — before/after photos a pro attaches to a craft job.

Revision ID: 0044
Revises: 0043
Create Date: 2026-06-22
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "craft_photos",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("request_id", sa.Uuid(), sa.ForeignKey("craft_requests.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("url", sa.String(1024), nullable=False),
        sa.Column("uploaded_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_craft_photos_request_id", "craft_photos", ["request_id"])


def downgrade() -> None:
    op.drop_index("ix_craft_photos_request_id", table_name="craft_photos")
    op.drop_table("craft_photos")
