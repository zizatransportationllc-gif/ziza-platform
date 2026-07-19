"""Add craft_ratings — customer rates the professional after an intervention.

Revision ID: 0051
Revises: 0050
Create Date: 2026-07-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "craft_ratings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "request_id",
            sa.Uuid(),
            sa.ForeignKey("craft_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "professional_id",
            sa.Uuid(),
            sa.ForeignKey("professionals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "customer_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("stars", sa.Integer(), nullable=False),
        sa.Column("comment", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_craft_ratings_request_id", "craft_ratings", ["request_id"], unique=True
    )
    op.create_index(
        "ix_craft_ratings_professional_id", "craft_ratings", ["professional_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_craft_ratings_professional_id", table_name="craft_ratings")
    op.drop_index("ix_craft_ratings_request_id", table_name="craft_ratings")
    op.drop_table("craft_ratings")
