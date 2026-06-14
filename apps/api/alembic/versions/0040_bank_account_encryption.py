"""Bank account encryption at rest: account_number→Text, add account_last4 — Sprint 69.

Revision ID: 0040
Revises: 0039
Create Date: 2026-06-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bank_accounts",
        sa.Column("account_last4", sa.String(4), nullable=False, server_default=""),
    )
    # account_number now holds a Fernet ciphertext (longer than a raw number).
    op.alter_column(
        "bank_accounts", "account_number",
        type_=sa.Text(), existing_type=sa.String(64), existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "bank_accounts", "account_number",
        type_=sa.String(64), existing_type=sa.Text(), existing_nullable=False,
    )
    op.drop_column("bank_accounts", "account_last4")
