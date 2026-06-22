"""Add craft_requests.verification_code — short code shared by customer & pro.

Revision ID: 0043
Revises: 0042
Create Date: 2026-06-22
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("craft_requests", sa.Column("verification_code", sa.String(8), nullable=True))


def downgrade() -> None:
    op.drop_column("craft_requests", "verification_code")
