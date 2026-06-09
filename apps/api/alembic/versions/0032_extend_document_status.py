"""0032 — Extend document status column to String(32).

Sprint 56:
  - driver_documents.status:       String(16) → String(32)
  - professional_documents.status: String(16) → String(32)

Reason: adding 'needs_resubmission' (18 chars) as a valid admin-set status
for document review; String(16) is too short.

Revision ID: 0032
Revises: 0031
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0032"
down_revision: str = "0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("driver_documents") as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=sa.String(length=16),
            type_=sa.String(length=32),
            existing_nullable=False,
            existing_server_default="pending",
        )

    with op.batch_alter_table("professional_documents") as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=sa.String(length=16),
            type_=sa.String(length=32),
            existing_nullable=False,
            existing_server_default="pending",
        )


def downgrade() -> None:
    with op.batch_alter_table("professional_documents") as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=sa.String(length=32),
            type_=sa.String(length=16),
            existing_nullable=False,
            existing_server_default="pending",
        )

    with op.batch_alter_table("driver_documents") as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=sa.String(length=32),
            type_=sa.String(length=16),
            existing_nullable=False,
            existing_server_default="pending",
        )
