"""0028 — add zone_type to cities, update country default.

Sprint 46: US/NJ localization.
  - cities.zone_type  VARCHAR(16) NOT NULL default 'city'
  - cities.country    server_default changed to 'United States'

Revision ID: 0028
Revises: 0027
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add zone_type column with default 'city' (backfills existing rows)
    op.add_column(
        "cities",
        sa.Column(
            "zone_type",
            sa.String(length=16),
            nullable=False,
            server_default="city",
        ),
    )


def downgrade() -> None:
    op.drop_column("cities", "zone_type")
