"""0026 — cities and service_zones tables.

Sprint 32: multi-city support with geofencing zones.

Revision ID: 0026
Revises: 0025
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("country", sa.String(length=64), nullable=False, server_default="Côte d'Ivoire"),
        sa.Column("center_lat", sa.Float(), nullable=False),
        sa.Column("center_lng", sa.Float(), nullable=False),
        sa.Column("radius_km", sa.Float(), nullable=False, server_default="30.0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_cities_name", "cities", ["name"])

    op.create_table(
        "service_zones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("city_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("polygon_geojson", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["city_id"], ["cities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_service_zones_city_id", "service_zones", ["city_id"])


def downgrade() -> None:
    op.drop_index("ix_service_zones_city_id", table_name="service_zones")
    op.drop_table("service_zones")
    op.drop_index("ix_cities_name", table_name="cities")
    op.drop_table("cities")
