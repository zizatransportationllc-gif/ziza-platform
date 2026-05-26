"""0022 — Notifications v2 + device_tokens (Sprint 26).

Changes:
  1. Add delivery-status columns to existing ``notifications`` table:
       channel, provider_ref, delivered_at, failed_at, retry_count
  2. Create new ``device_tokens`` table for FCM / web-push tokens.

Revision ID: 0022
Revises: 0021
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Enrich notifications table
    # ------------------------------------------------------------------
    op.add_column(
        "notifications",
        sa.Column(
            "channel",
            sa.String(16),
            nullable=False,
            server_default="in_app",
        ),
    )
    op.add_column(
        "notifications",
        sa.Column("provider_ref", sa.Text(), nullable=True),
    )
    op.add_column(
        "notifications",
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "notifications",
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "notifications",
        sa.Column(
            "retry_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    # ------------------------------------------------------------------
    # 2. Create device_tokens table
    # ------------------------------------------------------------------
    op.create_table(
        "device_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token", sa.Text(), nullable=False, unique=True),
        sa.Column(
            "platform",
            sa.String(16),
            nullable=False,
            server_default="web",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_device_tokens_user_id", "device_tokens", ["user_id"])
    op.create_index("ix_device_tokens_token", "device_tokens", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_device_tokens_token", table_name="device_tokens")
    op.drop_index("ix_device_tokens_user_id", table_name="device_tokens")
    op.drop_table("device_tokens")

    op.drop_column("notifications", "retry_count")
    op.drop_column("notifications", "failed_at")
    op.drop_column("notifications", "delivered_at")
    op.drop_column("notifications", "provider_ref")
    op.drop_column("notifications", "channel")
