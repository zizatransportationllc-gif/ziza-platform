"""Sprint 72 — Issuing cardholder is created with the real KYC billing address
and records the payee's acceptance of Stripe's Issuing Authorized User Terms."""
from app.payment import stripe_issuing


def test_create_cardholder_mock_without_key():
    """No Stripe key → deterministic fake cardholder id (dev/CI)."""
    cid = stripe_issuing.create_cardholder("Adam Morena", "adam@ziza.dev")
    assert cid.startswith("ich_mock_")


def _capture(monkeypatch) -> dict:
    captured = {}
    monkeypatch.setattr(stripe_issuing, "_enabled", lambda: True)

    def _fake_post(path, fields, account_id=None):
        captured["path"] = path
        captured["fields"] = fields
        captured["account"] = account_id
        return {"id": "ich_test_1"}

    monkeypatch.setattr(stripe_issuing, "_post", _fake_post)
    return captured


def test_cardholder_uses_real_address_and_records_terms(monkeypatch):
    captured = _capture(monkeypatch)
    addr = {
        "line1": "22 Main St", "line2": "Apt 4", "city": "Jersey City",
        "state": "NJ", "postal_code": "07302", "country": "US",
    }
    cid = stripe_issuing.create_cardholder(
        "Adam Morena", "adam@ziza.dev", "acct_1",
        address=addr, terms_ip="1.2.3.4", terms_date=1700000000,
    )
    assert cid == "ich_test_1"
    f = captured["fields"]
    assert captured["account"] == "acct_1"
    assert f["billing[address][line1]"] == "22 Main St"
    assert f["billing[address][line2]"] == "Apt 4"
    assert f["billing[address][city]"] == "Jersey City"
    assert f["billing[address][postal_code]"] == "07302"
    # Issuing Authorized User Terms acceptance recorded from the request IP.
    assert f["individual[card_issuing][user_terms_acceptance][ip]"] == "1.2.3.4"
    assert f["individual[card_issuing][user_terms_acceptance][date]"] == "1700000000"


def test_cardholder_falls_back_without_address_or_terms(monkeypatch):
    captured = _capture(monkeypatch)
    stripe_issuing.create_cardholder("Payee", None, "acct_1")  # no address, no terms
    f = captured["fields"]
    # Falls back to the Newark placeholder address.
    assert f["billing[address][city]"] == "Newark"
    assert f["billing[address][country]"] == "US"
    assert "billing[address][line2]" not in f
    # No IP captured → no terms-acceptance fields sent.
    assert "individual[card_issuing][user_terms_acceptance][ip]" not in f
