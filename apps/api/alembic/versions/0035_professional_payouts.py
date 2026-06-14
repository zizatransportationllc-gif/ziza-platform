"""Professional payout requests table — Sprint 67.

Revision ID: 0035
Revises: 0034
Create Date: 2026-06-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "professional_payout_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("professional_id", sa.Uuid(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("note_admin", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["professional_id"], ["professionals.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_professional_payout_requests_professional_id",
        "professional_payout_requests",
        ["professional_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_professional_payout_requests_professional_id",
        table_name="professional_payout_requests",
    )
    op.drop_table("professional_payout_requests")
