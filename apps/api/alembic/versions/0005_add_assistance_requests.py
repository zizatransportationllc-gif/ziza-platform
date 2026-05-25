"""Add assistance_requests table.

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-25 00:00:00.000000 UTC
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "assistance_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("driver_id", sa.Uuid(), nullable=True),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistance_customer_id", "assistance_requests", ["customer_id"])
    op.create_index("ix_assistance_driver_id", "assistance_requests", ["driver_id"])
    op.create_index("ix_assistance_status", "assistance_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_assistance_status", table_name="assistance_requests")
    op.drop_index("ix_assistance_driver_id", table_name="assistance_requests")
    op.drop_index("ix_assistance_customer_id", table_name="assistance_requests")
    op.drop_table("assistance_requests")
