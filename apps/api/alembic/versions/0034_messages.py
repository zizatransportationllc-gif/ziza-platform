"""In-app messaging: messages table — Sprint 66.

Revision ID: 0034
Revises: 0033
Create Date: 2026-06-12
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0034"
down_revision = "0033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trip_id", sa.Uuid(), nullable=True),
        sa.Column("craft_request_id", sa.Uuid(), nullable=True),
        sa.Column("sender_user_id", sa.Uuid(), nullable=False),
        sa.Column("sender_role", sa.String(32), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_messages_trip_id", "messages", ["trip_id"])
    op.create_index("ix_messages_craft_request_id", "messages", ["craft_request_id"])
    op.create_index("ix_messages_sender_user_id", "messages", ["sender_user_id"])
    op.create_index("ix_messages_created_at", "messages", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_messages_created_at", table_name="messages")
    op.drop_index("ix_messages_sender_user_id", table_name="messages")
    op.drop_index("ix_messages_craft_request_id", table_name="messages")
    op.drop_index("ix_messages_trip_id", table_name="messages")
    op.drop_table("messages")
