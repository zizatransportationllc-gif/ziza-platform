"""Add first_name, last_name, date_of_birth to users — Sprint 64.

Revision ID: 0033
Revises: 0032
Create Date: 2026-06-10
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0033"
down_revision = "0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("first_name", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("date_of_birth", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "date_of_birth")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
