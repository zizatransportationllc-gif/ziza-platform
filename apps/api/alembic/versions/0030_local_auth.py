"""0030 — Local auth: add password_hash to users.

Sprint 49:
  - users.password_hash  VARCHAR(255) nullable
    Stores a bcrypt hash for accounts created via POST /v1/auth/signup.
    NULL for Firebase / dev-seeded accounts (provider != "local").

Revision ID: 0030
Revises: 0029
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("password_hash", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "password_hash")
