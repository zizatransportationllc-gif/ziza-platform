"""Pricing engine — Sprint 5.

Fare calculation for rides in West Africa (currency: XOF).

Distance sources (in priority order):
  1. Google Maps Distance Matrix API  — if GOOGLE_MAPS_API_KEY is set
  2. Haversine straight-line × 1.3 road-factor fallback (no API key needed)

Fare formula:
  fare = max(base_fare, round((base_fare + distance_km × per_km_rate) × surge))
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

def calculate_fare(distance_km: float, surge: float = 1.0) -> int:
    """Return fare in XOF (West African CFA Franc).

    Formula: max(base_fare, round((base_fare + distance_km × per_km) × surge))
    """
    raw = (settings.fare_base_xof + distance_km * settings.fare_per_km_xof) * surge
    return max(settings.fare_base_xof, round(raw))
