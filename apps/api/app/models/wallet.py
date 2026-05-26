"""Wallet and WalletTransaction models — Sprint 33.

Wallet: one per user, stores XOF balance.
WalletTransaction: immutable ledger entry (credit/debit).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Transaction types
TX_CREDIT = "credit"          # money added to wallet
TX_DEBIT  = "debit"           # money spent from wallet
TX_REFUND = "refund"          # refund to wallet

# Credit reasons
REASON_TOPUP      = "topup"         # manual top-up via mobile money
REASON_PROMO      = "promo"         # promo code applied
REASON_TRIP_REFUND = "trip_refund"  # trip cancelled after payment

# Debit reasons
REASON_TRIP_PAYMENT = "trip_payment"   # paid trip from wallet
REASON_ADMIN_DEBIT  = "admin_debit"    # manual admin debit


class Wallet(Base):
    __tablename__ = "wallets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    balance_xof: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, onupdate=_now
    )

    transactions: Mapped[list["WalletTransaction"]] = relationship(
        "WalletTransaction", back_populates="wallet", lazy="select",
        order_by="WalletTransaction.created_at.desc()"
    )


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    wallet_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("wallets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tx_type: Mapped[str] = mapped_column(String(16), nullable=False)    # credit | debit | refund
    amount_xof: Mapped[float] = mapped_column(Float, nullable=False)    # always positive
    reason: Mapped[str] = mapped_column(String(64), nullable=False)     # topup, trip_payment…
    reference_id: Mapped[str | None] = mapped_column(String(128), nullable=True)  # trip_id or payment ref
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    balance_after: Mapped[float] = mapped_column(Float, nullable=False)  # snapshot
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, index=True
    )

    wallet: Mapped["Wallet"] = relationship("Wallet", back_populates="transactions")
