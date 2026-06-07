"""0031 — Professional documents & pending_docs status.

Sprint 54:
  - Create professional_documents table (KYC docs for professionals)
  - Drivers and professionals now start with status="pending_docs"
    (pure application-level default — no schema change needed for status column
    since it is a free-form String(32) with no DB check constraint)

Revision ID: 0031
Revises: 0030
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0031"
down_revision: str = "0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "professional_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("professional_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column(
            "status", sa.String(length=16), nullable=False, server_default="pending"
        ),
        sa.Column("note_admin", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["professional_id"], ["professionals.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_professional_documents_professional_id",
        "professional_documents",
        ["professional_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_professional_documents_professional_id",
        table_name="professional_documents",
    )
    op.drop_table("professional_documents")
