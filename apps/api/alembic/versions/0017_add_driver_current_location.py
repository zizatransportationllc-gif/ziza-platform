"""0017 — Add current location columns to drivers table (Sprint 23).

Adds ``current_lat``, ``current_lng``, ``last_seen_at`` to the ``drivers``
table as a denormalised snapshot of the driver's live position.
This enables fast tracking queries and proximity sorting in the dispatch
marketplace without joining the ``driver_locations`` table on every request.

The ``driver_locations`` table (Sprint 22) remains as the append-style source;
these columns are updated in sync whenever a driver pushes a location update.

Revision ID: 0017
Revises: 0016
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("drivers", sa.Column("current_lat", sa.Float, nullable=True))
    op.add_column("drivers", sa.Column("current_lng", sa.Float, nullable=True))
    op.add_column(
        "drivers",
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("drivers", "last_seen_at")
    op.drop_column("drivers", "current_lng")
    op.drop_column("drivers", "current_lat")
