"""Sprint 20 — Saved places tests (customer address book)."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tok(email: str) -> str:
    r = client.post("/v1/token", json={"email": email, "password": "ziza2024"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register(token: str) -> None:
    client.post("/v1/auth/register", headers=_h(token))


def _customer() -> str:
    tok = _tok("customer@ziza.dev")
    _register(tok)
    return tok


def _create_place(tok: str, label: str = "home", name: str = "Mon Domicile",
                  lat: float = 5.32, lng: float = -4.02) -> dict:
    r = client.post(
        "/v1/places",
        headers=_h(tok),
        json={"label": label, "name": name, "lat": lat, "lng": lng},
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# GET /v1/places
# ---------------------------------------------------------------------------

def test_list_places_requires_auth():
    r = client.get("/v1/places")
    assert r.status_code in (401, 403)


def test_list_places_returns_list():
    tok = _customer()
    r = client.get("/v1/places", headers=_h(tok))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# POST /v1/places
# ---------------------------------------------------------------------------

def test_create_place_requires_auth():
    r = client.post("/v1/places", json={"label": "home", "name": "X", "lat": 5.3, "lng": -4.0})
    assert r.status_code in (401, 403)


def test_create_place_success():
    tok = _customer()
    r = client.post(
        "/v1/places",
        headers=_h(tok),
        json={"label": "home", "name": "Cocody Riviéra", "lat": 5.3629, "lng": -3.9795},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert "place_id" in body
    assert body["label"] == "home"
    assert body["name"] == "Cocody Riviéra"
    assert abs(body["lat"] - 5.3629) < 0.001
    assert abs(body["lng"] - -3.9795) < 0.001
    assert "created_at" in body


def test_create_place_invalid_label_returns_422():
    tok = _customer()
    r = client.post(
        "/v1/places",
        headers=_h(tok),
        json={"label": "invalid_xyz", "name": "Somewhere", "lat": 5.3, "lng": -4.0},
    )
    assert r.status_code == 422, r.text


def test_create_place_all_labels_accepted():
    tok = _customer()
    for label in ("home", "work", "other"):
        r = client.post(
            "/v1/places",
            headers=_h(tok),
            json={"label": label, "name": f"Place {label}", "lat": 5.3, "lng": -4.0},
        )
        assert r.status_code == 201, f"label={label} failed: {r.text}"


def test_create_place_appears_in_list():
    tok = _customer()
    place = _create_place(tok, name="Bureau Plateau")

    r = client.get("/v1/places", headers=_h(tok))
    assert r.status_code == 200
    ids = [p["place_id"] for p in r.json()]
    assert place["place_id"] in ids


def test_create_place_enforces_max_10():
    """Creating more than 10 places returns 422."""
    tok = _tok("driver@ziza.dev")  # Use driver account to isolate from customer
    _register(tok)
    # Fill up to 10 (may already have some from other tests — just fill to limit)
    r0 = client.get("/v1/places", headers=_h(tok))
    existing = len(r0.json()) if r0.status_code == 200 else 0
    created = 0
    for i in range(10 - existing):
        r = client.post(
            "/v1/places",
            headers=_h(tok),
            json={"label": "other", "name": f"Place {i}", "lat": 5.3, "lng": -4.0},
        )
        if r.status_code == 201:
            created += 1
        elif r.status_code == 422:
            break  # already at limit
    # Now try to create one more
    total = client.get("/v1/places", headers=_h(tok)).json()
    if len(total) >= 10:
        r_over = client.post(
            "/v1/places",
            headers=_h(tok),
            json={"label": "other", "name": "One too many", "lat": 5.3, "lng": -4.0},
        )
        assert r_over.status_code == 422, r_over.text


# ---------------------------------------------------------------------------
# PATCH /v1/places/{place_id}
# ---------------------------------------------------------------------------

def test_update_place_name():
    tok = _customer()
    place = _create_place(tok, name="Ancien nom")
    pid = place["place_id"]

    r = client.patch(f"/v1/places/{pid}", headers=_h(tok), json={"name": "Nouveau nom"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Nouveau nom"
    # Other fields unchanged
    assert r.json()["label"] == place["label"]


def test_update_place_label():
    tok = _customer()
    place = _create_place(tok, label="other")
    pid = place["place_id"]

    r = client.patch(f"/v1/places/{pid}", headers=_h(tok), json={"label": "work"})
    assert r.status_code == 200, r.text
    assert r.json()["label"] == "work"


def test_update_place_coordinates():
    tok = _customer()
    place = _create_place(tok)
    pid = place["place_id"]

    r = client.patch(f"/v1/places/{pid}", headers=_h(tok), json={"lat": 5.999, "lng": -3.555})
    assert r.status_code == 200, r.text
    assert abs(r.json()["lat"] - 5.999) < 0.001
    assert abs(r.json()["lng"] - -3.555) < 0.001


def test_update_place_not_found_returns_404():
    tok = _customer()
    import uuid
    fake_id = str(uuid.uuid4())
    r = client.patch(f"/v1/places/{fake_id}", headers=_h(tok), json={"name": "X"})
    assert r.status_code == 404, r.text


def test_update_place_wrong_user_returns_404():
    """User A cannot update User B's places."""
    tok_a = _customer()
    tok_b = _tok("driver@ziza.dev")
    _register(tok_b)

    place = _create_place(tok_a)
    pid = place["place_id"]

    r = client.patch(f"/v1/places/{pid}", headers=_h(tok_b), json={"name": "Hijacked"})
    assert r.status_code == 404, r.text


def test_update_place_invalid_label_returns_422():
    tok = _customer()
    place = _create_place(tok)
    r = client.patch(
        f"/v1/places/{place['place_id']}",
        headers=_h(tok),
        json={"label": "bad_label"},
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# DELETE /v1/places/{place_id}
# ---------------------------------------------------------------------------

def test_delete_place_success():
    tok = _customer()
    # Reuse an existing place (shared DB may be at the 10-place limit)
    existing = client.get("/v1/places", headers=_h(tok)).json()
    assert len(existing) >= 1, "No places to delete — run create tests first"
    pid = existing[0]["place_id"]

    r = client.delete(f"/v1/places/{pid}", headers=_h(tok))
    assert r.status_code == 204, r.text

    # Confirm it's gone
    places_after = client.get("/v1/places", headers=_h(tok)).json()
    assert pid not in [p["place_id"] for p in places_after]


def test_delete_place_not_found_returns_404():
    tok = _customer()
    import uuid
    fake_id = str(uuid.uuid4())
    r = client.delete(f"/v1/places/{fake_id}", headers=_h(tok))
    assert r.status_code == 404, r.text


def test_delete_place_wrong_user_returns_404():
    """User B cannot delete User A's places."""
    tok_a = _customer()
    tok_b = _tok("admin@ziza.dev")
    _register(tok_b)

    # Reuse an existing place from customer (shared DB may be at limit)
    existing = client.get("/v1/places", headers=_h(tok_a)).json()
    assert len(existing) >= 1, "No places available — run create tests first"
    pid = existing[0]["place_id"]

    r = client.delete(f"/v1/places/{pid}", headers=_h(tok_b))
    assert r.status_code == 404, r.text


def test_delete_place_requires_auth():
    import uuid
    r = client.delete(f"/v1/places/{uuid.uuid4()}")
    assert r.status_code in (401, 403)
