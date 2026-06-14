"""Profile photo (users.avatar_url) + bank_accounts table — Sprint 69.

Revision ID: 0039
Revises: 0038
Create Date: 2026-06-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(512), nullable=True))
    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("account_holder_name", sa.String(128), nullable=False),
        sa.Column("bank_name", sa.String(128), nullable=True),
        sa.Column("routing_number", sa.String(34), nullable=False),
        sa.Column("account_number", sa.String(64), nullable=False),
        sa.Column("account_type", sa.String(16), nullable=False, server_default="checking"),
        sa.Column("country", sa.String(2), nullable=False, server_default="US"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", name="uq_bank_accounts_user_id"),
    )
    op.create_index("ix_bank_accounts_user_id", "bank_accounts", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_bank_accounts_user_id", table_name="bank_accounts")
    op.drop_table("bank_accounts")
    op.drop_column("users", "avatar_url")
