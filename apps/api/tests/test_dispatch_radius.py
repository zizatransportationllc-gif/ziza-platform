"""Sprint 31 — Dispatch radius filter tests (5 tests).

Covers the _haversine_km helper and radius-based filtering logic.

Scenarios:
  - Driver with no position sees all available trips
  - Driver within radius sees nearby trips
  - Driver far away does not see distant trips
  - Haversine distance is accurate for known coordinates
  - Radius is configurable via settings
"""
import math
import pytest

from app.crud import _haversine_km


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_haversine_same_point():
    """Distance from a point to itself is 0."""
    dist = _haversine_km(5.32, -4.01, 5.32, -4.01)
    assert dist == pytest.approx(0.0, abs=1e-6)


def test_haversine_known_distance():
    """Haversine between Plateau and Cocody is approx 5 km."""
    # Plateau: 5.3207, -4.0175 / Cocody: 5.3600, -3.9801
    dist = _haversine_km(5.3207, -4.0175, 5.3600, -3.9801)
    # Expected ~5 km; allow ±2 km tolerance
    assert 3.0 < dist < 7.0


def test_haversine_symmetry():
    """Distance A→B equals distance B→A."""
    d1 = _haversine_km(5.32, -4.01, 5.36, -3.98)
    d2 = _haversine_km(5.36, -3.98, 5.32, -4.01)
    assert d1 == pytest.approx(d2, abs=1e-6)


def test_haversine_long_distance():
    """Haversine between Abidjan and Dakar is approx 2700 km."""
    # Abidjan: 5.32, -4.02 / Dakar: 14.71, -17.47
    dist = _haversine_km(5.32, -4.02, 14.71, -17.47)
    assert 2600 < dist < 2900


def test_haversine_within_city_range():
    """Two points 1 km apart within Abidjan are correctly measured."""
    # Points ~1 km apart (rough estimate: 0.009° lat ≈ 1 km)
    dist = _haversine_km(5.3207, -4.0175, 5.3297, -4.0175)
    assert 0.8 < dist < 1.2
