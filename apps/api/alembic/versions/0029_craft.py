"""0029 — Ziza Craft marketplace tables.

Sprint 47:
  - professionals    (professional service providers)
  - craft_requests   (customer intervention requests)
  - craft_bids       (professional bids on requests)

Revision ID: 0029
Revises: 0028
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- professionals --------------------------------------------------------
    op.create_table(
        "professionals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("specialties", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("is_online", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("current_lat", sa.Float(), nullable=True),
        sa.Column("current_lng", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_professionals_user_id", "professionals", ["user_id"])

    # -- craft_requests -------------------------------------------------------
    # NOTE: selected_bid_id is stored as plain UUID (no FK) to avoid circular
    # dependency with craft_bids. Application logic enforces the relationship.
    op.create_table(
        "craft_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("address", sa.String(length=512), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("bid_deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("selected_bid_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["customer_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_craft_requests_customer_id", "craft_requests", ["customer_id"])
    op.create_index("ix_craft_requests_status", "craft_requests", ["status"])

    # -- craft_bids -----------------------------------------------------------
    op.create_table(
        "craft_bids",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("professional_id", sa.Uuid(), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("eta_min", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("professional_lat", sa.Float(), nullable=True),
        sa.Column("professional_lng", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["professional_id"], ["professionals.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["request_id"], ["craft_requests.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_craft_bids_request_id", "craft_bids", ["request_id"])
    op.create_index("ix_craft_bids_professional_id", "craft_bids", ["professional_id"])


def downgrade() -> None:
    op.drop_index("ix_craft_bids_professional_id", table_name="craft_bids")
    op.drop_index("ix_craft_bids_request_id", table_name="craft_bids")
    op.drop_table("craft_bids")

    op.drop_index("ix_craft_requests_status", table_name="craft_requests")
    op.drop_index("ix_craft_requests_customer_id", table_name="craft_requests")
    op.drop_table("craft_requests")

    op.drop_index("ix_professionals_user_id", table_name="professionals")
    op.drop_table("professionals")
