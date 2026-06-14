#!/usr/bin/env python3
"""
Ziza — Sprint 47 demo seed (New Jersey deployment)
===================================================
50 customers · 10 drivers · 3 professionals · 1 city (Newark, NJ)
14 days of trips · 7 craft requests · bids & selections

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

Idempotent: the script checks for an existing city named "Newark" and
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
from app.models.craft import CraftBid, CraftRequest, Professional
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
# Static reference data — New Jersey
# ---------------------------------------------------------------------------

# New Jersey neighborhoods: (name, center_lat, center_lng)
NJ_ZONES = [
    ("Downtown Newark",  40.7357, -74.1724),
    ("Jersey City",      40.7178, -74.0431),
    ("Hoboken",          40.7440, -74.0324),
    ("Trenton",          40.2171, -74.7429),
    ("Hackensack",       40.8859, -74.0435),
    ("Princeton",        40.3573, -74.6672),
    ("Elizabeth",        40.6640, -74.2107),
    ("Newark Airport",   40.6895, -74.1745),
    ("Irvington",        40.7248, -74.2285),
    ("Montclair",        40.8251, -74.2090),
    ("Parsippany",       40.8576, -74.4243),
    ("Woodbridge",       40.5576, -74.2843),
]

MALE_FIRST = [
    "James", "Robert", "John", "Michael", "David", "William", "Richard",
    "Joseph", "Thomas", "Charles", "Christopher", "Daniel", "Matthew",
    "Anthony", "Donald", "Mark", "Paul", "Steven", "Andrew", "Joshua",
]
FEMALE_FIRST = [
    "Mary", "Patricia", "Jennifer", "Linda", "Barbara", "Elizabeth", "Susan",
    "Jessica", "Sarah", "Karen", "Lisa", "Nancy", "Betty", "Margaret",
    "Sandra", "Ashley", "Dorothy", "Kimberly", "Emily", "Donna",
]
SURNAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Wilson", "Anderson", "Taylor", "Thomas", "Jackson", "White",
    "Harris", "Martin", "Thompson", "Moore", "Young", "Allen",
    "King", "Wright", "Hill", "Scott", "Adams", "Baker", "Carter",
    "Green", "Lewis", "Nelson",
]
PHONE_PREFIXES = ["+1 (201)", "+1 (732)", "+1 (609)", "+1 (973)", "+1 (908)"]

RATING_COMMENTS = [
    "Great service, very punctual!",
    "Smooth ride, highly recommend.",
    "Clean and comfortable car.",
    "Very friendly driver.",
    "On time, perfect.",
    "Smooth trip, thank you.",
    "Very satisfied with the service.",
    "Safe and careful driving.",
    "Highly recommend without hesitation.",
    "Driver knows New Jersey very well.",
    "Professional service.",
    "Trip was a bit long but good.",
    "Could improve on punctuality.",
    "Satisfactory.",
    None, None, None,  # ~20 % no comment
]

# 10 driver profiles: (full_name, license, make, model, year, color, category, plate)
DRIVER_PROFILES = [
    ("James Smith",          "LIC-NJ-2019-001", "Toyota",    "Camry",       2019, "Silver", "economy", "NJA-1234"),
    ("Robert Johnson",       "LIC-NJ-2020-002", "Honda",     "Civic",       2020, "White",  "economy", "NJB-5678"),
    ("Michael Williams",     "LIC-NJ-2021-003", "Kia",       "Soul",        2021, "Blue",   "economy", "NJC-9012"),
    ("David Brown",          "LIC-NJ-2022-004", "Toyota",    "Avalon",      2022, "Black",  "comfort", "NJD-3456"),
    ("William Jones",        "LIC-NJ-2020-005", "Honda",     "Accord",      2020, "Gray",   "comfort", "NJE-7890"),
    ("Richard Garcia",       "LIC-NJ-2021-006", "Mercedes",  "C 300",       2021, "Black",  "premium", "NJF-2345"),
    ("Joseph Miller",        "LIC-NJ-2022-007", "BMW",       "5 Series",    2022, "White",  "premium", "NJG-6789"),
    ("Thomas Davis",         "LIC-NJ-2019-008", "Hyundai",   "Elantra",     2019, "Red",    "economy", "NJH-0123"),
    ("Charles Wilson",       "LIC-NJ-2020-009", "Chevrolet", "Malibu",      2020, "Silver", "economy", "NJI-4567"),
    ("Christopher Anderson", "LIC-NJ-2021-010", "Kia",       "Sportage",    2021, "Blue",   "comfort", "NJJ-8901"),
]

# Demo users — must match SEEDED_USERS in app/auth/dev_adapter.py
DEMO_USERS = [
    ("customer@ziza.dev",      "usr_001", "customer",     "Demo Customer",     "+1 (201) 555-0001"),
    ("driver@ziza.dev",        "usr_002", "driver",       "Demo Driver",       "+1 (201) 555-0002"),
    ("admin@ziza.dev",         "usr_003", "admin",        "Demo Admin",        "+1 (201) 555-0003"),
    ("professional@ziza.dev",  "usr_004", "professional", "Demo Professional", "+1 (201) 555-0004"),
]

# ---------------------------------------------------------------------------
# Craft — Sprint 47
# ---------------------------------------------------------------------------

# 3 seed professionals: (email, user_id, full_name, phone, specialties, bio)
PROFESSIONAL_SEED_USERS = [
    (
        "pr01@seed.ziza.dev", "seed_pro_01", "Marcus Williams",
        "+1 (973) 555-0101",
        "breakdown,battery,diagnostics",
        "ASE-certified mechanic, 15 years roadside experience in NJ. On-site diagnostics + repair.",
    ),
    (
        "pr02@seed.ziza.dev", "seed_pro_02", "Carlos Rivera",
        "+1 (732) 555-0202",
        "tow,accident,flat_tyre",
        "Licensed tow operator. Light and heavy-duty towing across Essex & Union County. 24/7.",
    ),
    (
        "pr03@seed.ziza.dev", "seed_pro_03", "Diana Chen",
        "+1 (201) 555-0303",
        "fuel,lockout,flat_tyre,battery",
        "Fast roadside response — fuel delivery, lockout, tire change, jump-start. Always stocked.",
    ),
]

# 7 craft request scenarios: (category, description, address, lat, lng)
CRAFT_REQUEST_SCENARIOS = [
    (
        "breakdown",
        "Car completely dead on I-95 North near Exit 13A. Engine cranks but won't fire. Need mechanic ASAP.",
        "I-95 N, Exit 13A, Elizabeth NJ 07201",
        40.6640, -74.2107,
    ),
    (
        "flat_tyre",
        "Flat tire on NJ Turnpike southbound near mile marker 110. Have no spare. Need help urgently.",
        "NJ Turnpike SB, MM 110, Woodbridge NJ",
        40.5576, -74.2843,
    ),
    (
        "battery",
        "Car won't start in parking garage — clicking noise when turning key. Need jump-start or new battery.",
        "Penn Station Parking, Newark NJ 07102",
        40.7351, -74.1727,
    ),
    (
        "tow",
        "Transmission failure, car stuck on Route 1 near Edison. Need tow to nearest garage.",
        "Route 1 South, Edison NJ 08817",
        40.5187, -74.4121,
    ),
    (
        "lockout",
        "Locked keys inside car at Target parking lot. Baby seat visible inside — urgent!",
        "Target, Journal Square, Jersey City NJ 07306",
        40.7323, -74.0641,
    ),
    (
        "fuel",
        "Ran out of gas on Garden State Parkway southbound near Exit 127. Need fuel delivery.",
        "GSP SB, Exit 127, Woodbridge NJ",
        40.5700, -74.2900,
    ),
    (
        "accident",
        "Minor fender-bender on Route 9 — car still driveable but need help managing scene and filing report.",
        "Route 9, Woodbridge NJ 07095",
        40.5580, -74.2870,
    ),
]

# Bid note templates per category
BID_NOTES = {
    "breakdown":    ["Will bring full diagnostic kit + common spares. ETA as stated.", "Carry OBD scanner + spark plugs, belts, fuses. Most breakdowns fixed on-site.", None],
    "flat_tyre":    ["Mobile tire service — carry multiple sizes. Swap in 20 min.", "Have patch kit + portable compressor + spare tires. Fast fix.", None],
    "battery":      ["Carry AGM and lead-acid batteries for most makes. Jump-start or replace on-site.", "Bring 1000A booster + replacement batteries. Quick diagnosis too.", None],
    "tow":          ["Flatbed truck available. Can tow any vehicle up to 8,000 lbs.", "Covered flatbed, no damage to your vehicle. Know all local garages.", None],
    "lockout":      ["Slim jim + pick set for any door. Non-destructive entry in under 5 min.", "Certified locksmith. All vehicles, no damage. Available 24/7.", None],
    "fuel":         ["Carry 5 gal of 87, 89, and 93 octane + diesel. Drop-off included.", "Emergency fuel truck. Always 10 gallons on board, any grade.", None],
    "accident":     ["Will help document scene, call tow if needed, and assist with paperwork.", "Roadside incident management — scene safety, documentation, tow coordination.", None],
    "diagnostics":  ["OBD-II scanner + smoke test + multimeter. Full report provided.", "ASE certified. Can diagnose check engine, ABS, airbag codes on-site.", None],
    "other":        ["Experienced roadside tech — describe your issue and I'll tell you if I can help.", None],
}

# Fare config per category: base (USD cents) + per_km (cents) + per_min (cents), minimum
FARE_CFG = {
    "economy": {"base": 200, "per_km": 90,  "per_min": 18, "min": 750},
    "comfort":  {"base": 300, "per_km": 130, "per_min": 28, "min": 1200},
    "premium":  {"base": 500, "per_km": 210, "per_min": 45, "min": 2500},
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
    return max(cfg["min"], int(round(raw / 25) * 25))  # nearest 25 cents


def _random_point() -> tuple[float, float]:
    _, lat, lng = RNG.choice(NJ_ZONES)
    return _jitter(lat, lng)


def _random_name() -> tuple[str, str]:
    """Return (full_name, phone)."""
    first = RNG.choice(RNG.choice([MALE_FIRST, FEMALE_FIRST]))
    last = RNG.choice(SURNAMES)
    prefix = RNG.choice(PHONE_PREFIXES)
    phone = f"{prefix} {RNG.randint(200, 999)}-{RNG.randint(1000, 9999)}"
    return f"{first} {last}", phone


def _past(days: float) -> datetime:
    return _now() - timedelta(days=days)


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------

async def _reset(session: AsyncSession) -> None:
    """Delete all seed data (@seed.ziza.dev users) and the Newark city.

    Cascade order:
      craft_bids   (FK → professionals + craft_requests)
      craft_requests (FK → users, cascade)
      professionals  (FK → users, cascade)
      seed users     (root — deletes everything above via CASCADE)
    """
    print("[RESET] Deleting seed data...")

    # Collect seed user UUIDs
    res = await session.execute(
        select(User.id).where(User.email.like(f"%@{SEED_DOMAIN}"))
    )
    seed_user_ids = [r[0] for r in res.all()]

    if not seed_user_ids:
        print("   No seed data found.")
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
        print(f"   {len(seed_user_ids)} seed users deleted.")

    # 4. Delete city Newark (cascades -> service_zones)
    await session.execute(delete(City).where(City.name == "Newark"))
    print("   City Newark deleted.")


# ---------------------------------------------------------------------------
# City
# ---------------------------------------------------------------------------

async def _seed_city(session: AsyncSession) -> City:
    print("[CITY] Creating city: Newark, NJ")
    city = City(
        id=uuid.uuid4(),
        name="Newark",
        country="United States",
        center_lat=40.7357,
        center_lng=-74.1724,
        radius_km=50.0,
        active=True,
        created_at=_past(60),
    )
    session.add(city)
    await session.flush()

    for name in [
        "Northern Zone (Hackensack – Montclair)",
        "Central Zone (Newark – Jersey City – Hoboken)",
        "Southern Zone (Elizabeth – Woodbridge – Trenton)",
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
    """Ensure the 4 dev demo users exist in the database."""
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
    print("[DRIVERS] Creating 10 drivers...")
    results: list[tuple[User, Driver, Vehicle]] = []

    for i, (full_name, license_num, make, model, year, color, category, plate) in \
            enumerate(DRIVER_PROFILES, start=1):

        created_at = _past(45 - i * 2)
        is_online = RNG.random() < 0.4

        prefix = RNG.choice(PHONE_PREFIXES)
        phone = f"{prefix} {RNG.randint(200, 999)}-{RNG.randint(1000, 9999)}"

        user = User(
            id=uuid.uuid4(),
            user_id=f"seed_drv_{i:02d}",
            email=f"d{i:02d}@{SEED_DOMAIN}",
            role="driver",
            provider="dev",
            name=full_name,
            phone=phone,
            created_at=created_at,
            updated_at=created_at,
        )
        session.add(user)
        await session.flush()

        lat, lng = _jitter(40.7357, -74.1724, radius_km=5.0)
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
    print(f"   {len(results)} drivers created.")
    return results


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

async def _seed_customers(session: AsyncSession) -> list[User]:
    print("[CUSTOMERS] Creating 50 customers...")
    customers: list[User] = []

    # USD cents: $5, $10, $25, $50, $100, $250
    topup_amounts = [500, 1000, 2500, 5000, 10000, 25000]

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

    # Wallet + initial top-up for each customer
    for user in customers:
        amount = float(RNG.choice(topup_amounts))
        wallet_created = user.created_at + timedelta(minutes=RNG.randint(2, 15))
        wallet = Wallet(
            id=uuid.uuid4(),
            user_id=user.id,
            balance_cents=amount,
            created_at=wallet_created,
            updated_at=wallet_created,
        )
        session.add(wallet)
        await session.flush()

        session.add(WalletTransaction(
            id=uuid.uuid4(),
            wallet_id=wallet.id,
            tx_type="credit",
            amount_cents=amount,
            reason="topup",
            note="Initial wallet top-up",
            balance_after=amount,
            created_at=wallet_created,
        ))

    await session.flush()
    print("   50 customers created with wallets.")
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
                              "fare_cents": trip.fare_cents}))
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
    print("[TRIPS] Creating trips (14 days)...")

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

            # Pick two distinct NJ zones
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
                fare_cents=fare if status == "completed" else None,
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
                    amount_cents=fare,
                    currency="USD",
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
            fare_cents=None,
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

    print(f"   {total_trips} trips, {total_ratings} ratings, {total_payments} payments.")


# ---------------------------------------------------------------------------
# Payout requests
# ---------------------------------------------------------------------------

async def _seed_payouts(
    session: AsyncSession,
    driver_rows: list[tuple[User, Driver, Vehicle]],
) -> None:
    print("[PAYOUTS] Creating payout requests...")
    statuses_pool = ["pending", "pending", "approved", "approved", "processed", "rejected"]
    total = 0

    for i, (_, driver, _) in enumerate(driver_rows):
        for j in range(RNG.randint(1, 3)):
            status = RNG.choice(statuses_pool)
            # USD cents: $250, $500, $750, $1000, $1500
            amount = RNG.choice([25000, 50000, 75000, 100000, 150000])
            commission = int(amount * 0.15)
            net = amount - commission
            created_at = _past(RNG.randint(1, 14))

            session.add(PayoutRequest(
                id=uuid.uuid4(),
                driver_id=driver.id,
                amount_cents=amount,
                status=status,
                commission_cents=commission if status in ("approved", "processed") else None,
                net_amount_cents=net if status in ("approved", "processed") else None,
                provider_ref=(
                    f"PAYOUT-{driver.id.hex[:8]}-{j:02d}"
                    if status == "processed" else None
                ),
                note_admin=(
                    "Approved after verification" if status == "approved" else
                    "Insufficient verifiable balance" if status == "rejected" else
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
    print(f"   {total} payout requests created.")


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
        balance_cents=5000.0,  # $50.00 in USD cents
        created_at=wallet_at,
        updated_at=wallet_at,
    )
    session.add(wallet)
    await session.flush()

    session.add(WalletTransaction(
        id=uuid.uuid4(),
        wallet_id=wallet.id,
        tx_type="credit",
        amount_cents=5000.0,
        reason="topup",
        note="Initial demo top-up",
        balance_after=5000.0,
        created_at=wallet_at,
    ))
    await session.flush()


# ---------------------------------------------------------------------------
# Sprint 47 — Ziza Craft seed
# ---------------------------------------------------------------------------

async def _seed_craft(
    session: AsyncSession,
    customers: list[User],
    demo_customer: User | None,
    demo_professional: User | None,
) -> None:
    """Seed professionals, craft requests, and bids.

    Status distribution across 7 requests:
      2 × open         (bidding window active — visible on mobile-craft HomeScreen)
      1 × bidding_closed (deadline passed, customer hasn't selected yet)
      2 × assigned      (bid selected — professional dispatched)
      1 × completed     (job done)
      1 × cancelled
    """
    print("[CRAFT] Creating professionals, craft requests, and bids...")

    # ── 1. Seed professional users ────────────────────────────────────────────
    pro_users: list[User] = []
    for email, user_id, full_name, phone, _, _ in PROFESSIONAL_SEED_USERS:
        existing = (await session.execute(
            select(User).where(User.email == email)
        )).scalar_one_or_none()
        if existing is None:
            existing = User(
                id=uuid.uuid4(),
                user_id=user_id,
                email=email,
                role="professional",
                provider="dev",
                name=full_name,
                phone=phone,
                created_at=_past(20),
                updated_at=_past(20),
            )
            session.add(existing)
        pro_users.append(existing)
    await session.flush()

    # ── 2. Create Professional profiles ──────────────────────────────────────
    professionals: list[Professional] = []
    for user, (_, _, _, _, specialties, bio) in zip(pro_users, PROFESSIONAL_SEED_USERS):
        existing_prof = (await session.execute(
            select(Professional).where(Professional.user_id == user.id)
        )).scalar_one_or_none()
        if existing_prof is None:
            lat, lng = _jitter(40.7357, -74.1724, radius_km=10.0)
            existing_prof = Professional(
                id=uuid.uuid4(),
                user_id=user.id,
                specialties=specialties,
                bio=bio,
                status="active",
                is_online=RNG.random() < 0.7,
                current_lat=lat,
                current_lng=lng,
                created_at=_past(20),
            )
            session.add(existing_prof)
        professionals.append(existing_prof)
    await session.flush()

    # ── 3. Register demo professional (professional@ziza.dev) ─────────────────
    if demo_professional:
        existing_prof = (await session.execute(
            select(Professional).where(Professional.user_id == demo_professional.id)
        )).scalar_one_or_none()
        if existing_prof is None:
            lat, lng = _jitter(40.7357, -74.1724, radius_km=5.0)
            session.add(Professional(
                id=uuid.uuid4(),
                user_id=demo_professional.id,
                specialties="plumbing,electrical,locksmith,mechanic,carpentry,painting,cleaning,hvac,other",
                bio="Demo professional account — can bid on all categories.",
                status="active",
                is_online=True,
                current_lat=lat,
                current_lng=lng,
                created_at=_past(25),
            ))
        await session.flush()

    # ── 4. Craft requests ─────────────────────────────────────────────────────
    # Mix of seed customers + demo customer for variety
    customer_pool = customers[:15] + ([demo_customer] if demo_customer else [])

    # Status scenario: (status, days_ago, bid_deadline_hours_from_creation)
    #   open            → bid_deadline in the future (2h from now)
    #   bidding_closed  → deadline in the past
    #   assigned        → bid selected
    #   completed       → job done
    #   cancelled       → cancelled
    scenarios = [
        ("open",          0,   2),    # request[0]: open, bids received, deadline 2h ahead
        ("open",          0,   2),    # request[1]: open, no bids yet
        ("bidding_closed", 1,  -2),   # request[2]: deadline passed, no selection
        ("assigned",      3,   -48),  # request[3]: assigned (bid selected)
        ("assigned",      5,   -72),  # request[4]: assigned
        ("completed",     10,  -240), # request[5]: completed
        ("cancelled",     2,   -36),  # request[6]: cancelled
    ]

    craft_requests: list[CraftRequest] = []
    for i, ((category, description, address, lat, lng), (req_status, days_ago, deadline_h)) in \
            enumerate(zip(CRAFT_REQUEST_SCENARIOS, scenarios)):

        customer = RNG.choice(customer_pool)
        created_at = _past(days_ago) if days_ago > 0 else (_now() - timedelta(hours=1))
        deadline = created_at + timedelta(hours=deadline_h)
        updated_at = created_at if req_status == "open" else created_at + timedelta(hours=abs(deadline_h) + 1)

        req = CraftRequest(
            id=uuid.uuid4(),
            customer_id=customer.id,
            category=category,
            description=description,
            lat=lat,
            lng=lng,
            address=address,
            status=req_status,
            bid_deadline=deadline,
            selected_bid_id=None,
            created_at=created_at,
            updated_at=updated_at,
        )
        session.add(req)
        craft_requests.append(req)

    await session.flush()

    # ── 5. Bids ───────────────────────────────────────────────────────────────
    # Build a mapping of which professionals can bid on which categories
    def _matching_pros(category: str) -> list[Professional]:
        matches = [p for p in professionals if category in p.specialties]
        return matches if matches else professionals  # fallback: anyone

    for i, (req, (req_status, days_ago, deadline_h)) in enumerate(zip(craft_requests, scenarios)):
        if req_status == "cancelled":
            continue  # no bids on cancelled requests

        category = req.category
        matching = _matching_pros(category)
        n_bids = RNG.randint(2, min(3, len(matching) + 1)) if req_status != "open" or i == 0 else 0
        # request[1] is open with no bids yet — represents a freshly posted request

        bid_created = req.created_at + timedelta(minutes=RNG.randint(5, 60))
        selected_bid: CraftBid | None = None

        for j, pro in enumerate(RNG.sample(matching + professionals, min(n_bids, len(professionals)))):
            # Price ranges in USD cents for automotive roadside interventions
            base_prices = {
                "breakdown":   (8000,  20000),   # $80–$200 on-site repair
                "flat_tyre":   (4500,  9500),    # $45–$95 tire change/patch
                "tow":         (9500,  25000),   # $95–$250 towing
                "fuel":        (3500,  7000),    # $35–$70 fuel delivery
                "lockout":     (4500,  9000),    # $45–$90 lockout service
                "battery":     (5500,  14000),   # $55–$140 jump-start or replacement
                "accident":    (12000, 30000),   # $120–$300 scene management + tow
                "diagnostics": (7000,  15000),   # $70–$150 on-site diagnostics
                "other":       (5000,  15000),   # $50–$150 misc
            }
            lo, hi = base_prices.get(category, (5000, 15000))
            price_cents = RNG.randrange(lo, hi, 500)
            eta_min = RNG.randint(15, 60)
            pro_lat, pro_lng = _jitter(req.lat, req.lng, radius_km=8.0)

            bid_status = "pending"
            if req_status in ("assigned", "completed"):
                bid_status = "accepted" if j == 0 else "rejected"

            note_options = BID_NOTES.get(category, [None])
            bid = CraftBid(
                id=uuid.uuid4(),
                request_id=req.id,
                professional_id=pro.id,
                price_cents=price_cents,
                eta_min=eta_min,
                note=RNG.choice(note_options),
                professional_lat=pro_lat,
                professional_lng=pro_lng,
                status=bid_status,
                created_at=bid_created + timedelta(minutes=j * RNG.randint(3, 15)),
            )
            session.add(bid)

            if bid_status == "accepted":
                selected_bid = bid

        # Link selected bid to request for assigned/completed
        if selected_bid and req_status in ("assigned", "completed"):
            req.selected_bid_id = selected_bid.id

        # Add demo professional bid on the first open request so they can test selection
        if i == 0 and demo_professional:
            demo_prof_row = (await session.execute(
                select(Professional).where(Professional.user_id == demo_professional.id)
            )).scalar_one_or_none()
            if demo_prof_row:
                existing_bid = (await session.execute(
                    select(CraftBid).where(
                        CraftBid.request_id == req.id,
                        CraftBid.professional_id == demo_prof_row.id,
                    )
                )).scalar_one_or_none()
                if existing_bid is None:
                    demo_lat, demo_lng = _jitter(req.lat, req.lng, radius_km=3.0)
                    session.add(CraftBid(
                        id=uuid.uuid4(),
                        request_id=req.id,
                        professional_id=demo_prof_row.id,
                        price_cents=9500,
                        eta_min=20,
                        note="Demo professional bid — test account.",
                        professional_lat=demo_lat,
                        professional_lng=demo_lng,
                        status="pending",
                        created_at=bid_created + timedelta(minutes=2),
                    ))

    await session.flush()

    # Count for summary
    n_reqs = len(craft_requests)
    n_pros = len(professionals) + (1 if demo_professional else 0)
    bid_count = await session.scalar(
        select(func.count()).select_from(CraftBid)
    )
    print(f"   {n_pros} professionals, {n_reqs} craft requests, {bid_count} bids.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def seed(reset: bool = False) -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL is not set.")
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
                    f"[INFO] Seed data already present ({seed_count} users @{SEED_DOMAIN}).\n"
                    "       Use --reset to wipe and re-seed."
                )
                return

            # ── Seed ───────────────────────────────────────────────────────
            print("\n[SEED] Ziza seed (Sprint 47 — New Jersey + Craft) starting...\n")

            # City: upsert (API may have already created Newark via _ensure_city_defaults)
            existing_city = (await session.execute(
                select(City).where(City.name == "Newark")
            )).scalar_one_or_none()
            if existing_city is None:
                await _seed_city(session)
            else:
                print("[CITY] City Newark already present (auto-seeded by API).")
            demo_users = await _seed_demo_users(session)
            driver_rows = await _seed_drivers(session)
            customers = await _seed_customers(session)

            demo_customer      = next((u for u in demo_users if u.role == "customer"),      None)
            demo_professional  = next((u for u in demo_users if u.role == "professional"),  None)

            if demo_customer:
                await _ensure_demo_wallet(session, demo_customer)

            await _seed_trips(session, customers, driver_rows, demo_customer)
            await _seed_payouts(session, driver_rows)
            await _seed_craft(session, customers, demo_customer, demo_professional)

    await engine.dispose()

    print("""
[OK] Seed complete!

Login accounts (password: ziza2024)
  customer@ziza.dev      -> mobile-customer / web-customer
  driver@ziza.dev        -> mobile-driver
  admin@ziza.dev         -> web-admin
  professional@ziza.dev  -> mobile-craft  (Sprint 47)

Seed professionals (mobile-craft login)
  pr01@seed.ziza.dev  Marcus Williams  — breakdown, battery, diagnostics
  pr02@seed.ziza.dev  Carlos Rivera    — tow, accident, flat_tyre
  pr03@seed.ziza.dev  Diana Chen       — fuel, lockout, flat_tyre, battery

Generated data
  - 1 city         : Newark, NJ (3 service zones)
  - 10 drivers     : d01@seed.ziza.dev ... d10@seed.ziza.dev
  - 50 customers   : c01@seed.ziza.dev ... c50@seed.ziza.dev
  - ~180 trips     : last 14 days (completed, cancelled, in progress)
  - Ratings, payments, payout requests included
  - 4 professionals: 3 seed + professional@ziza.dev (Sprint 47)
  - 7 craft requests: 2 open, 1 bidding_closed, 2 assigned, 1 completed, 1 cancelled
  - Bids with price (USD cents), ETA, GPS coordinates
  - Currency: USD (amounts stored as integer cents)

Ziza Craft test flows
  As professional@ziza.dev in mobile-craft:
    → HomeScreen shows 2 open requests nearby (use GPS near Newark NJ)
    → Tap request[0] to see existing bids + submit your own bid
    → Profile: all specialties pre-selected

  As customer@ziza.dev in mobile-customer:
    → HomeScreen → "My Requests" shows 1 assigned + past requests
    → BidsScreen on open request → select a professional
""")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ziza Sprint-47 seed — 50 customers, 10 drivers, 4 professionals, ~180 trips, 7 craft requests (New Jersey)."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Delete existing seed data before re-seeding.",
    )
    args = parser.parse_args()
    asyncio.run(seed(reset=args.reset))


if __name__ == "__main__":
    main()
