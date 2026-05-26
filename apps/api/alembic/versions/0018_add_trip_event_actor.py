"""0018 — Add actor column to trip_events table (Sprint 23).

Each ``TripEvent`` row now records *who* triggered the state transition:
  - ``"customer"``  — customer-initiated actions (create_trip, cancel_trip)
  - ``"driver"``    — driver-initiated actions (accept, start, complete)
  - ``"system"``    — automated platform actions (future use)

Existing rows will have ``actor = NULL`` (retroactively unknown — acceptable).

Revision ID: 0018
Revises: 0017
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "trip_events",
        sa.Column("actor", sa.String(16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trip_events", "actor")
