"""Pricing engine — Sprint 5 (USD/cents since Sprint 66).

Fare calculation for rides. **Base currency: USD; all amounts are integer
cents.** The per-distance rate is priced **per mile** (distance is computed in
km internally and converted to miles for the fare).

Distance sources (in priority order):
  1. Google Maps Distance Matrix API  — if GOOGLE_MAPS_API_KEY is set
  2. Haversine straight-line × 1.3 road-factor fallback (no API key needed)

Fare formula:
  miles = distance_km / 1.609344
  fare_cents = max(base_fare_cents, round((base_fare_cents + miles × per_mile_cents) × surge))

base_fare_cents and per_mile_cents are admin-configurable (see crud.get_pricing).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import httpx

from app.config import settings

# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

_EARTH_RADIUS_KM = 6_371.0


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Straight-line distance in km between two GPS coordinates."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Distance / duration resolution
# ---------------------------------------------------------------------------

_ROAD_FACTOR = 1.30       # straight-line → road distance multiplier
_AVG_SPEED_KMH = 28.0     # urban West Africa average (~28 km/h with traffic)
_GMAPS_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"


@dataclass
class RouteInfo:
    distance_km: float
    duration_min: int
    source: str   # "google_maps" | "haversine"


async def get_route_info(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> RouteInfo:
    """Return road distance and estimated duration.

    Uses Google Maps Distance Matrix API when configured; falls back to
    Haversine × road-factor otherwise.
    """
    if settings.google_maps_api_key:
        try:
            return await _gmaps_route(origin_lat, origin_lng, dest_lat, dest_lng)
        except Exception:
            pass  # fall through to haversine on any API error

    return _haversine_route(origin_lat, origin_lng, dest_lat, dest_lng)


async def _gmaps_route(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> RouteInfo:
    params = {
        "origins": f"{origin_lat},{origin_lng}",
        "destinations": f"{dest_lat},{dest_lng}",
        "key": settings.google_maps_api_key,
        "mode": "driving",
        "language": "fr",
    }
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(_GMAPS_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    element = data["rows"][0]["elements"][0]
    if element["status"] != "OK":
        raise ValueError(f"Google Maps element status: {element['status']}")

    distance_m = element["distance"]["value"]
    duration_s = element["duration"]["value"]
    return RouteInfo(
        distance_km=round(distance_m / 1_000, 2),
        duration_min=max(1, round(duration_s / 60)),
        source="google_maps",
    )


def _haversine_route(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> RouteInfo:
    straight_km = haversine(origin_lat, origin_lng, dest_lat, dest_lng)
    road_km = round(straight_km * _ROAD_FACTOR, 2)
    duration = max(1, round(road_km / _AVG_SPEED_KMH * 60))
    return RouteInfo(distance_km=road_km, duration_min=duration, source="haversine")


# ---------------------------------------------------------------------------
# Fare calculation
# ---------------------------------------------------------------------------

_KM_PER_MILE = 1.609344


def calculate_fare(
    distance_km: float,
    base_fare_cents: int,
    per_mile_cents: int,
    surge: float = 1.0,
) -> int:
    """Return the fare in USD cents (integer).

    ``base_fare_cents`` and ``per_mile_cents`` are supplied by the caller (read
    from the admin-configurable platform settings; see crud.get_pricing).

    Formula::
        miles = distance_km / 1.609344
        fare  = max(base_fare_cents, round((base_fare_cents + miles × per_mile_cents) × surge))
    """
    miles = distance_km / _KM_PER_MILE
    raw = (base_fare_cents + miles * per_mile_cents) * surge
    return max(base_fare_cents, round(raw))
