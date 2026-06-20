"""Address autocomplete formatting — Google-Maps-style primary/secondary lines.

The live Nominatim call is not exercised here (external service); we test the
pure ``_format_place`` transform that shapes each row.
"""
from app.main import _format_place


def test_format_place_house_and_road():
    item = {
        "place_id": 1,
        "display_name": "123, Main Street, Newark, Essex County, New Jersey, 07102, USA",
        "lat": "40.735",
        "lon": "-74.172",
        "address": {
            "house_number": "123",
            "road": "Main Street",
            "city": "Newark",
            "state": "New Jersey",
        },
    }
    r = _format_place(item)
    assert r.primary == "123 Main Street"
    assert r.secondary == "Newark, New Jersey"
    assert r.name == "123 Main Street, Newark, New Jersey"
    assert r.lat == 40.735 and r.lng == -74.172


def test_format_place_poi_name_fallback():
    item = {
        "place_id": 2,
        "display_name": "Liberty Science Center, Jersey City, New Jersey, USA",
        "lat": "40.66",
        "lon": "-74.05",
        "name": "Liberty Science Center",
        "address": {"city": "Jersey City", "state": "New Jersey"},
    }
    r = _format_place(item)
    assert r.primary == "Liberty Science Center"
    assert r.secondary == "Jersey City, New Jersey"


def test_format_place_town_used_when_no_city():
    item = {
        "place_id": 3,
        "display_name": "Ocean Avenue, Belmar, Monmouth County, New Jersey, USA",
        "lat": "40.17",
        "lon": "-74.02",
        "address": {"road": "Ocean Avenue", "town": "Belmar", "state": "New Jersey"},
    }
    r = _format_place(item)
    assert r.primary == "Ocean Avenue"
    assert r.secondary == "Belmar, New Jersey"
