#!/usr/bin/env python3
"""
Ziza — Sprint 21 demo seed
==========================
50 customers · 10 drivers · 1 city (Abidjan) · 14 days of trips

Usage (local):
  cd apps/api
  DATABASE_URL=postgresql+asyncpg://ziza:ziza-local@localhost:5432/ziza \\
      python scripts/seed.py

Usage (GCP via Cloud SQL unix socket):
  DATABASE_URL=postgresql+asyncpg://user:pass@/ziza?host=/cloudsql/PROJECT:REGION:INSTANCE \\
      python scripts/seed.py

Flags:
  --reset   Delete existing seed data (detected by @seed.ziza.dev emails)
            then re-seed from scratch.

Idempotent: the script checks for an existing city named "Abidjan" and
exits early if found.  Use --reset to wipe and re-run.
"""
from __future__ import annotations

import argparse
import asyncio
import math
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# sys.path: run as   python scripts/seed.py  from inside  apps/api/
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, ".."))

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registers all ORM models with Base.metadata
from app.db import _normalise_url
from app.models.city import City, ServiceZone
from app.models.driver import Driver
from app.models.driver_location import DriverLocation
from app.models.payment import PaymentIntent
from app.models.payout_request import PayoutRequest
from app.models.rating import Rating
from app.models.trip import Trip, TripEvent
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.wallet import Wallet, WalletTransaction

# ---------------------------------------------------------------------------
# Reproducible randomness
# ---------------------------------------------------------------------------
RNG = random.Random(42)

# Email suffix that marks all generated (non-demo) seed accounts
SEED_DOMAIN = "seed.ziza.dev"

# ---------------------------------------------------------------------------
# Static reference data
# ---------------------------------------------------------------------------

# Abidjan neighbourhoods: (name, center_lat, center_lng)
ABIDJAN_ZONES = [
    ("Plateau",      5.3190, -4.0183),
    ("Cocody",       5.3597, -3.9862),
    ("Yopougon",     5.3667, -4.0833),
    ("Marcory",      5.3071, -3.9823),
    ("Adjamé",       5.3583, -4.0167),
    ("Treichville",  5.3030, -3.9990),
    ("Abobo",        5.4167, -4.0167),
    ("Port-Bouet",   5.2544, -3.9289),
    ("Koumassi",     5.3023, -3.9757),
    ("Riviera",      5.3735, -3.9566),
    ("Zone 4",       5.3098, -4.0052),
    ("Bingerville",  5.3575, -3.8868),
]

MALE_FIRST = [
    "Kouadio", "Kouassi", "Koffi", "Konan", "Yao", "Moussa", "Ibrahim",
    "Mohamed", "Seydou", "Dramane", "Lacina", "Adama", "Boubacar",
    "Issouf", "Cheick", "Lamine", "Oumar", "Abou", "Bakary", "Siaka",
]
FEMALE_FIRST = [
    "Akissi", "Adjoua", "Ama", "Affoue", "Aminata", "Mariama",
    "Fatoumata", "Bintou", "Nathalie", "Nadia", "Prisca", "Cynthia",
    "Michelle", "Sandra", "Grace", "Mariam", "Khady", "Aïssatou",
    "Salimata", "Kadiatou",
]
SURNAMES = [
    "Coulibaly", "Koné", "Traoré", "Bamba", "Diomandé", "Ouattara", "Touré",
    "Diabaté", "Konaté", "Camara", "Sanogo", "Soro", "Fofana", "Séry",
    "Gnamba", "Kouadio", "Assi", "Brou", "Achi", "Dago", "Niamké",
    "Kouame", "Ahouré", "N'Goran", "Tape", "Dao", "Silué", "Kra",
    "Boa", "Eba",
]
PHONE_PREFIXES = ["+225 07", "+225 05", "+225 01"]

RATING_COMMENTS = [
    "Super service, chauffeur ponctuel !",
    "Bonne conduite, je recommande.",
    "Voiture propre et confortable.",
    "Chauffeur très agréable.",
    "Arrivé à l'heure, parfait.",
    "Trajet fluide, merci.",
    "Très satisfait du service.",
    "Conduite sécurisée.",
    "À recommander sans hésiter.",
    "Le chauffeur connaît bien Abidjan.",
    "Service professionnel.",
    "Trajet un peu long mais bien.",
    "Peut mieux faire sur la ponctualité.",
    "Correct.",
    None, None, None,  # ~20 % sans commentaire
]

# 10 driver profiles: (full_name, license, make, model, year, color, category, plate)
DRIVER_PROFILES = [
    ("Kouadio Jean-Marie", "LIC-2019-001", "Toyota",   "Corolla",      2019, "Gris",   "economy", "AB-1234-A"),
    ("Traoré Mamadou",     "LIC-2020-002", "Hyundai",  "i10",          2020, "Blanc",  "economy", "AB-5678-B"),
    ("Koné Ibrahim",       "LIC-2021-003", "Kia",      "Rio",          2021, "Bleu",   "economy", "AB-9012-C"),
    ("Coulibaly Seydou",   "LIC-2022-004", "Toyota",   "Camry",        2022, "Noir",   "comfort", "AB-3456-D"),
    ("Bamba Oumar",        "LIC-2020-005", "Honda",    "Accord",       2020, "Argent", "comfort", "AB-7890-E"),
    ("Diomandé Ali",       "LIC-2021-006", "Mercedes", "C 200",        2021, "Noir",   "premium", "AB-2345-F"),
    ("Soro Cheick",        "LIC-2022-007", "Toyota",   "Land Cruiser", 2022, "Blanc",  "premium", "AB-6789-G"),
    ("Sanogo Drissa",      "LIC-2019-008", "Suzuki",   "Swift",        2019, "Rouge",  "economy", "AB-0123-H"),
    ("Fofana Karim",       "LIC-2020-009", "Renault",  "Logan",        2020, "Gris",   "economy", "AB-4567-I"),
    ("Diabaté Moussa",     "LIC-2021-010", "Kia",      "Sportage",     2021, "Bleu",   "comfort", "AB-8901-J"),
]

# Demo users — must match SEEDED_USERS in app/auth/dev_adapter.py
DEMO_USERS = [
    ("customer@ziza.dev", "usr_001", "customer", "Client Démo",    "+225 07 00 00 01"),
    ("driver@ziza.dev",   "usr_002", "driver",   "Chauffeur Démo", "+225 07 00 00 02"),
    ("admin@ziza.dev",    "usr_003", "admin",    "Admin Démo",     "+225 07 00 00 03"),
]

# Fare config per category: base (XOF) + per_km (XOF) + per_min (XOF), minimum
FARE_CFG = {
    "economy": {"base": 500,  "per_km": 150, "per_min": 25,  "min": 1500},
    "comfort":  {"base": 750,  "per_km": 225, "per_min": 37,  "min": 2500},
    "premium":  {"base": 1500, "per_km": 375, "per_min": 62,  "min": 4000},
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _jitter(lat: float, lng: float, radius_km: float = 1.5) -> tuple[float, float]:
    """Offset a lat/lng by up to radius_km in each direction."""
    d_lat = radius_km / 111.0
    d_lng = radius_km / (111.0 * math.cos(math.radians(lat)))
    return (
        lat + RNG.uniform(-d_lat, d_lat),
        lng + RNG.uniform(-d_lng, d_lng),
    )


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _fare(dist_km: float, dur_min: int, category: str) -> int:
    cfg = FARE_CFG[category]
    raw = cfg["base"] + dist_km * cfg["per_km"] + dur_min * cfg["per_min"]
    return max(cfg["min"], int(round(raw / 50) * 50))  # nearest 50 XOF


def _random_point() -> tuple[float, float]:
    _, lat, lng = RNG.choice(ABIDJAN_ZONES)
    return _jitter(lat, lng)


def _random_name() -> tuple[str, str]:
    """Return (full_name, phone)."""
    first = RNG.choice(RNG.choice([MALE_FIRST, FEMALE_FIRST]))
    last = RNG.choice(SURNAMES)
    phone = (f"{RNG.choice(PHONE_PREFIXES)} "
             f"{RNG.randint(10, 99)} {RNG.randint(10, 99)} {RNG.randint(10, 99)}")
    return f"{first} {last}", phone


def _past(days: float) -> datetime:
    return _now() - timedelta(days=days)


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

async def _reset(session: AsyncSession) -> None:
    """Delete all seed data (@seed.ziza.dev users) and the Abidjan city."""
    print("[RESET] Suppression des donnees seed...")

    # Collect seed user UUIDs
    res = await session.execute(
        select(User.id).where(User.email.like(f"%@{SEED_DOMAIN}"))
    )
    seed_user_ids = [r[0] for r in res.all()]

    if not seed_user_ids:
        print("   Aucune donnee seed trouvee.")
    else:
        # Collect seed driver UUIDs
        res = await session.execute(
            select(Driver.id).where(Driver.user_id.in_(seed_user_ids))
        )
        seed_driver_ids = [r[0] for r in res.all()]

        # 1. Null out driver_id on trips driven by seed drivers whose
        #    customer is NOT a seed user (avoids FK violation on user delete).
        if seed_driver_ids:
            await session.execute(
                update(Trip)
                .where(
                    Trip.driver_id.in_(seed_driver_ids),
                    Trip.customer_id.not_in(seed_user_ids),
                )
                .values(driver_id=None)
            )

        # 2. Delete trips where customer is a seed user
        #    (cascades → trip_events, ratings, payment_intents)
        await session.execute(
            delete(Trip).where(Trip.customer_id.in_(seed_user_ids))
        )

        # 3. Delete seed users
        #    (cascades → drivers → vehicles / payout_requests / driver_locations,
        #               wallets → wallet_transactions, ratings, notifications…)
        await session.execute(
            delete(User).where(User.email.like(f"%@{SEED_DOMAIN}"))
        )
        print(f"   {len(seed_user_ids)} utilisateurs seed supprimes.")

    # 4. Delete city Abidjan (cascades -> service_zones)
    await session.execute(delete(City).where(City.name == "Abidjan"))
    print("   Ville Abidjan supprimee.")


# ---------------------------------------------------------------------------
# City
# ---------------------------------------------------------------------------

async def _seed_city(session: AsyncSession) -> City:
    print("[CITY] Creation de la ville : Abidjan")
    city = City(
        id=uuid.uuid4(),
        name="Abidjan",
        country="Côte d'Ivoire",
        center_lat=5.3364,
        center_lng=-4.0267,
        radius_km=40.0,
        active=True,
        created_at=_past(60),
    )
    session.add(city)
    await session.flush()

    for name in [
        "Zone Nord (Abobo – Adjamé)",
        "Zone Centre (Plateau – Treichville)",
        "Zone Est (Cocody – Bingerville)",
    ]:
        session.add(ServiceZone(
            id=uuid.uuid4(),
            city_id=city.id,
            name=name,
            active=True,
            created_at=city.created_at,
        ))
    await session.flush()
    return city


# ---------------------------------------------------------------------------
# Demo users
# ---------------------------------------------------------------------------

async def _seed_demo_users(session: AsyncSession) -> list[User]:
    """Ensure the 3 dev demo users exist in the database."""
    result: list[User] = []
    for email, user_id, role, name, phone in DEMO_USERS:
        existing = (await session.execute(
            select(User).where(User.email == email)
        )).scalar_one_or_none()
        if existing is None:
            existing = User(
                id=uuid.uuid4(),
                user_id=user_id,
                email=email,
                role=role,
                provider="dev",
                name=name,
                phone=phone,
                created_at=_past(30),
                updated_at=_past(30),
            )
            session.add(existing)
        result.append(existing)
    await session.flush()
    return result


# ---------------------------------------------------------------------------
# Drivers
# ---------------------------------------------------------------------------

async def _seed_drivers(session: AsyncSession) -> list[tuple[User, Driver, Vehicle]]:
    print("[DRIVERS] Creation de 10 chauffeurs...")
    results: list[tuple[User, Driver, Vehicle]] = []

    for i, (full_name, license_num, make, model, year, color, category, plate) in \
            enumerate(DRIVER_PROFILES, start=1):

        created_at = _past(45 - i * 2)
        is_online = RNG.random() < 0.4

        user = User(
            id=uuid.uuid4(),
            user_id=f"seed_drv_{i:02d}",
            email=f"d{i:02d}@{SEED_DOMAIN}",
            role="driver",
            provider="dev",
            name=full_name,
            phone=(f"+225 07 {RNG.randint(10,99)} "
                   f"{RNG.randint(10,99)} {RNG.randint(10,99)}"),
            created_at=created_at,
            updated_at=created_at,
        )
        session.add(user)
        await session.flush()

        lat, lng = _jitter(5.3364, -4.0267, radius_km=5.0)
        driver = Driver(
            id=uuid.uuid4(),
            user_id=user.id,
            license_number=license_num,
            status="active",
            is_online=is_online,
            current_lat=lat if is_online else None,
            current_lng=lng if is_online else None,
            last_seen_at=_now() - timedelta(minutes=RNG.randint(1, 25)) if is_online else None,
            created_at=created_at,
        )
        session.add(driver)
        await session.flush()

        vehicle = Vehicle(
            id=uuid.uuid4(),
            driver_id=driver.id,
            plate=plate,
            make=make,
            model=model,
            year=year,
            color=color,
            category=category,
            status="active",
            created_at=created_at,
        )
        session.add(vehicle)

        if is_online:
            session.add(DriverLocation(
                id=uuid.uuid4(),
                driver_id=driver.id,
                lat=lat,
                lng=lng,
                updated_at=driver.last_seen_at,
            ))

        results.append((user, driver, vehicle))

    await session.flush()
    print(f"   {len(results)} chauffeurs crees.")
    return results


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

async def _seed_customers(session: AsyncSession) -> list[User]:
    print("[CUSTOMERS] Creation de 50 clients...")
    customers: list[User] = []

    topup_amounts = [5_000, 10_000, 20_000, 25_000, 50_000, 100_000]

    for i in range(1, 51):
        name, phone = _random_name()
        created_at = _past(RNG.uniform(5, 28))

        user = User(
            id=uuid.uuid4(),
            user_id=f"seed_cust_{i:02d}",
            email=f"c{i:02d}@{SEED_DOMAIN}",
            role="customer",
            provider="dev",
            name=name,
            phone=phone,
            created_at=created_at,
            updated_at=created_at,
        )
        session.add(user)
        customers.append(user)

    await session.flush()

    # Wallet + initial topup for each customer
    for user in customers:
        amount = float(RNG.choice(topup_amounts))
        wallet_created = user.created_at + timedelta(minutes=RNG.randint(2, 15))
        wallet = Wallet(
            id=uuid.uuid4(),
            user_id=user.id,
            balance_xof=amount,
            created_at=wallet_created,
            updated_at=wallet_created,
        )
        session.add(wallet)
        await session.flush()

        session.add(WalletTransaction(
            id=uuid.uuid4(),
            wallet_id=wallet.id,
            tx_type="credit",
            amount_xof=amount,
            reason="topup",
            note="Rechargement Mobile Money",
            balance_after=amount,
            created_at=wallet_created,
        ))

    await session.flush()
    print("   50 clients crees avec portefeuilles.")
    return customers


# ---------------------------------------------------------------------------
# Trips helpers
# ---------------------------------------------------------------------------

def _trip_events(
    trip: Trip,
    start: datetime,
    dur_min: int,
    status: str,
    driver: Driver,
) -> list[TripEvent]:
    """Build the state-machine event log for a trip."""

    def ev(etype: str, dt: datetime, actor: str, data: dict | None = None) -> TripEvent:
        return TripEvent(
            id=uuid.uuid4(),
            trip_id=trip.id,
            event_type=etype,
            actor=actor,
            data=data,
            created_at=dt,
        )

    events = [ev("status_changed", start, "customer", {"from": None, "to": "pending"})]

    if status == "cancelled":
        events.append(ev(
            "status_changed",
            start + timedelta(minutes=RNG.randint(1, 5)),
            RNG.choice(["customer", "system"]),
            {"from": "pending", "to": "cancelled"},
        ))
        return events

    accepted_at = start + timedelta(minutes=RNG.randint(1, 3))
    events.append(ev("status_changed", accepted_at, "driver",
                     {"from": "pending", "to": "accepted",
                      "driver_id": str(driver.id)}))

    if status in ("in_progress", "completed"):
        started_at = accepted_at + timedelta(minutes=RNG.randint(3, 8))
        events.append(ev("status_changed", started_at, "driver",
                         {"from": "accepted", "to": "in_progress"}))

        if status == "completed":
            completed_at = started_at + timedelta(minutes=dur_min)
            events.append(ev("status_changed", completed_at, "driver",
                             {"from": "in_progress", "to": "completed",
                              "fare_xof": trip.fare_xof}))
    return events


# ---------------------------------------------------------------------------
# Trips
# ---------------------------------------------------------------------------

async def _seed_trips(
    session: AsyncSession,
    customers: list[User],
    driver_rows: list[tuple[User, Driver, Vehicle]],
    demo_customer: User | None,
) -> None:
    print("[TRIPS] Creation des courses (14 jours)...")

    drivers_vehicles = [(d, v) for (_, d, v) in driver_rows]
    pool = customers + ([demo_customer] if demo_customer else [])

    total_trips = total_ratings = total_payments = 0

    # Collect in two phases to respect FK ordering at flush time
    trips_to_add: list[Trip] = []
    related_to_add: list[TripEvent | Rating | PaymentIntent] = []

    # ── Past 14 days ──────────────────────────────────────────────────────
    for days_ago in range(14, 0, -1):
        ref_date = _now() - timedelta(days=days_ago)
        weekday = ref_date.weekday()
        n = RNG.randint(10, 18) if weekday >= 4 else RNG.randint(8, 14)

        for _ in range(n):
            customer = RNG.choice(pool)
            driver, vehicle = RNG.choice(drivers_vehicles)
            category = vehicle.category

            # Peak hours: 7-9h, 12-13h, 17-19h
            hour = (RNG.choice([7, 8, 12, 13, 17, 18, 19])
                    if RNG.random() < 0.60 else RNG.randint(6, 22))

            start = ref_date.replace(
                hour=hour,
                minute=RNG.randint(0, 59),
                second=RNG.randint(0, 59),
                microsecond=0,
            ).astimezone(timezone.utc)

            # Pick two distinct Abidjan zones
            origin_lat, origin_lng = _random_point()
            dest_lat, dest_lng = _random_point()
            for _ in range(3):
                if _haversine_km(origin_lat, origin_lng, dest_lat, dest_lng) >= 1.0:
                    break
                dest_lat, dest_lng = _random_point()

            dist_km = round(
                _haversine_km(origin_lat, origin_lng, dest_lat, dest_lng), 2
            )
            dur_min = max(10, int(dist_km * 4 + RNG.randint(-3, 5)))
            fare = _fare(dist_km, dur_min, category)

            # 72 % completed, 15 % cancelled, 13 % completed (skewed further)
            r = RNG.random()
            status = "cancelled" if r < 0.15 else "completed"

            trip_end = (
                start + timedelta(minutes=dur_min + RNG.randint(1, 3))
                if status == "completed"
                else start + timedelta(minutes=RNG.randint(1, 5))
            )

            trip = Trip(
                id=uuid.uuid4(),
                customer_id=customer.id,
                driver_id=driver.id if status == "completed" else (
                    driver.id if RNG.random() < 0.3 else None
                ),
                status=status,
                origin_lat=origin_lat,
                origin_lng=origin_lng,
                dest_lat=dest_lat,
                dest_lng=dest_lng,
                fare_xof=fare if status == "completed" else None,
                distance_km=dist_km,
                duration_min=dur_min,
                category=category,
                created_at=start,
                updated_at=trip_end,
            )
            trips_to_add.append(trip)
            total_trips += 1

            # Events
            related_to_add.extend(
                _trip_events(trip, start, dur_min, status, driver)
            )

            # Rating (80 % of completed trips)
            if status == "completed" and RNG.random() < 0.80:
                stars = RNG.choices([5, 4, 3, 2, 1], weights=[50, 30, 15, 4, 1])[0]
                related_to_add.append(Rating(
                    id=uuid.uuid4(),
                    trip_id=trip.id,
                    driver_id=driver.id,
                    customer_id=customer.id,
                    stars=stars,
                    comment=RNG.choice(RATING_COMMENTS),
                    created_at=trip_end + timedelta(minutes=RNG.randint(2, 30)),
                ))
                total_ratings += 1

            # Payment (80 % of completed trips)
            if status == "completed" and RNG.random() < 0.80:
                paid_at = trip_end + timedelta(minutes=RNG.randint(1, 10))
                related_to_add.append(PaymentIntent(
                    id=uuid.uuid4(),
                    trip_id=trip.id,
                    amount_xof=fare,
                    currency="XOF",
                    provider="mock",
                    provider_ref=f"mock_{trip.id.hex[:12]}",
                    status="paid",
                    created_at=trip_end,
                    updated_at=paid_at,
                ))
                trip.paid_at = paid_at
                total_payments += 1

    # ── Today: 1-3 active trips ────────────────────────────────────────────
    for _ in range(RNG.randint(1, 3)):
        customer = RNG.choice(pool)
        driver, vehicle = RNG.choice(drivers_vehicles)
        origin_lat, origin_lng = _random_point()
        dest_lat, dest_lng = _random_point()
        dist_km = round(_haversine_km(origin_lat, origin_lng, dest_lat, dest_lng), 2)
        dur_min = max(10, int(dist_km * 4))
        fare = _fare(dist_km, dur_min, vehicle.category)
        now = _now()
        active_status = RNG.choice(["pending", "accepted", "in_progress"])

        trip = Trip(
            id=uuid.uuid4(),
            customer_id=customer.id,
            driver_id=driver.id if active_status != "pending" else None,
            status=active_status,
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            dest_lat=dest_lat,
            dest_lng=dest_lng,
            fare_xof=None,
            distance_km=dist_km,
            duration_min=dur_min,
            category=vehicle.category,
            created_at=now - timedelta(minutes=RNG.randint(5, 30)),
            updated_at=now - timedelta(minutes=RNG.randint(1, 10)),
        )
        trips_to_add.append(trip)
        total_trips += 1
        related_to_add.extend(
            _trip_events(trip, trip.created_at, dur_min, active_status, driver)
        )

    # ── Flush in two passes (trips first, then FKs) ────────────────────────
    for trip in trips_to_add:
        session.add(trip)
    await session.flush()

    for obj in related_to_add:
        session.add(obj)
    await session.flush()

    print(f"   {total_trips} courses, {total_ratings} avis, {total_payments} paiements.")


# ---------------------------------------------------------------------------
# Payout requests
# ---------------------------------------------------------------------------

async def _seed_payouts(
    session: AsyncSession,
    driver_rows: list[tuple[User, Driver, Vehicle]],
) -> None:
    print("[PAYOUTS] Creation des demandes de paiement...")
    statuses_pool = ["pending", "pending", "approved", "approved", "processed", "rejected"]
    total = 0

    for i, (_, driver, _) in enumerate(driver_rows):
        for j in range(RNG.randint(1, 3)):
            status = RNG.choice(statuses_pool)
            amount = RNG.choice([25_000, 50_000, 75_000, 100_000, 150_000])
            commission = int(amount * 0.15)
            net = amount - commission
            created_at = _past(RNG.randint(1, 14))

            session.add(PayoutRequest(
                id=uuid.uuid4(),
                driver_id=driver.id,
                amount_xof=amount,
                status=status,
                commission_xof=commission if status in ("approved", "processed") else None,
                net_amount_xof=net if status in ("approved", "processed") else None,
                provider_ref=(
                    f"PAYOUT-{driver.id.hex[:8]}-{j:02d}"
                    if status == "processed" else None
                ),
                note_admin=(
                    "Approuvé après vérification" if status == "approved" else
                    "Solde insuffisant vérifiable" if status == "rejected" else
                    None
                ),
                processed_at=created_at + timedelta(days=1) if status == "processed" else None,
                created_at=created_at,
                updated_at=(
                    created_at + timedelta(hours=RNG.randint(1, 48))
                    if status != "pending" else created_at
                ),
            ))
            total += 1

    await session.flush()
    print(f"   {total} demandes creees.")


# ---------------------------------------------------------------------------
# Demo-customer wallet
# ---------------------------------------------------------------------------

async def _ensure_demo_wallet(session: AsyncSession, demo_customer: User) -> None:
    existing = (await session.execute(
        select(Wallet).where(Wallet.user_id == demo_customer.id)
    )).scalar_one_or_none()

    if existing is not None:
        return

    wallet_at = demo_customer.created_at + timedelta(minutes=5)
    wallet = Wallet(
        id=uuid.uuid4(),
        user_id=demo_customer.id,
        balance_xof=50_000.0,
        created_at=wallet_at,
        updated_at=wallet_at,
    )
    session.add(wallet)
    await session.flush()

    session.add(WalletTransaction(
        id=uuid.uuid4(),
        wallet_id=wallet.id,
        tx_type="credit",
        amount_xof=50_000.0,
        reason="topup",
        note="Rechargement initial démo",
        balance_after=50_000.0,
        created_at=wallet_at,
    ))
    await session.flush()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def seed(reset: bool = False) -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL non defini.")
        sys.exit(1)

    db_url = _normalise_url(db_url)
    engine = create_async_engine(db_url, echo=False, pool_pre_ping=True)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        async with session.begin():
            # ── Reset ──────────────────────────────────────────────────────
            if reset:
                await _reset(session)

            # ── Idempotency check (seed users, not city — city is auto-created by API) ──
            seed_count = await session.scalar(
                select(func.count()).select_from(User)
                .where(User.email.like(f"%@{SEED_DOMAIN}"))
            )
            if seed_count and seed_count > 0:
                print(
                    f"[INFO] Donnees seed deja presentes ({seed_count} users @{SEED_DOMAIN}).\n"
                    "       Utilisez --reset pour repartir de zero."
                )
                return

            # ── Seed ───────────────────────────────────────────────────────
            print("\n[SEED] Seed Ziza (Sprint 21) en cours...\n")

            # City: upsert (API may have already created Abidjan via _ensure_city_defaults)
            existing_city = (await session.execute(
                select(City).where(City.name == "Abidjan")
            )).scalar_one_or_none()
            if existing_city is None:
                await _seed_city(session)
            else:
                print("[CITY] Ville Abidjan deja presente (auto-seedee par l'API).")
            demo_users = await _seed_demo_users(session)
            driver_rows = await _seed_drivers(session)
            customers = await _seed_customers(session)

            demo_customer = next((u for u in demo_users if u.role == "customer"), None)
            if demo_customer:
                await _ensure_demo_wallet(session, demo_customer)

            await _seed_trips(session, customers, driver_rows, demo_customer)
            await _seed_payouts(session, driver_rows)

    await engine.dispose()

    print("""
[OK] Seed termine !

Comptes de connexion (mot de passe : ziza2024)
  customer@ziza.dev   -> web-customer
  driver@ziza.dev     -> web-driver
  admin@ziza.dev      -> web-admin

Donnees generees
  - 1 ville      : Abidjan (3 zones de service)
  - 10 chauffeurs: d01@seed.ziza.dev ... d10@seed.ziza.dev
  - 50 clients   : c01@seed.ziza.dev ... c50@seed.ziza.dev
  - ~180 courses : 14 derniers jours (completes, annulees, en cours)
  - Avis, paiements, demandes de retrait inclus
""")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ziza Sprint-21 seed — génère 50 clients, 10 chauffeurs, ~180 courses."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Supprime les données seed existantes avant de reseed.",
    )
    args = parser.parse_args()
    asyncio.run(seed(reset=args.reset))


if __name__ == "__main__":
    main()
