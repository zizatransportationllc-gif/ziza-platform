"""0024 — driver_applications table.

Sprint 30: workflow candidature chauffeur.

Revision ID: 0024
Revises: 0023
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "driver_applications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="submitted"),
        sa.Column("full_name", sa.String(length=128), nullable=False),
        sa.Column("phone", sa.String(length=32), nullable=False),
        sa.Column("license_number", sa.String(length=64), nullable=False),
        sa.Column("vehicle_make", sa.String(length=64), nullable=False),
        sa.Column("vehicle_model", sa.String(length=64), nullable=False),
        sa.Column("vehicle_plate", sa.String(length=32), nullable=False),
        sa.Column("vehicle_year", sa.Integer(), nullable=False),
        sa.Column("vehicle_category", sa.String(length=32), nullable=False, server_default="economy"),
        sa.Column("notes_admin", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_driver_applications_user_id"),
    )
    op.create_index("ix_driver_applications_user_id", "driver_applications", ["user_id"])
    op.create_index("ix_driver_applications_status", "driver_applications", ["status"])


def downgrade() -> None:
    op.drop_index("ix_driver_applications_status", table_name="driver_applications")
    op.drop_index("ix_driver_applications_user_id", table_name="driver_applications")
    op.drop_table("driver_applications")
