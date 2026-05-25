"""0012 — Add driver_documents table for KYC (Sprint 17).

Revision ID: 0012
Revises: 0011
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "driver_documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "driver_id",
            sa.Uuid(),
            sa.ForeignKey("drivers.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("note_admin", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("driver_documents")
