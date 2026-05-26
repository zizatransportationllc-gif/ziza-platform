"""0020 — Add paid_at column to trips table (Sprint 24).

``paid_at`` is set to the current timestamp when a PaymentIntent for that
trip is confirmed via the ``POST /v1/payments/webhook`` endpoint.

Revision ID: 0020
Revises: 0019
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trips",
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trips", "paid_at")
