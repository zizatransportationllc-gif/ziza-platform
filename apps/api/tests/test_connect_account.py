"""Sprint 71 — Stripe Connect account creation uses a Custom (Issuing-ready) config.

Custom connected accounts are required for Stripe Issuing. This asserts the
account-creation payload requests the controller config + card_issuing capability
when Stripe is enabled, and still returns a deterministic fake in dev/CI.
"""
import urllib.error

from app.payment import stripe_connect


def _http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError(
        "https://api.stripe.com/v1/accounts/x", code, "err", {}, None
    )


def test_create_connected_account_mock_without_key():
    """No Stripe key → deterministic fake account id (dev/CI)."""
    acct = stripe_connect.create_connected_account("driver@ziza.dev")
    assert acct.startswith("acct_mock_")


# ---------------------------------------------------------------------------
# account_exists — detect stale/mock ids so onboarding can re-provision
# ---------------------------------------------------------------------------

def test_account_exists_true_in_dev(monkeypatch):
    """No Stripe key → every id is treated as valid (mock onboarding)."""
    monkeypatch.setattr(stripe_connect, "_enabled", lambda: False)
    assert stripe_connect.account_exists("acct_mock_anything") is True


def test_account_exists_false_when_stripe_has_no_such_account(monkeypatch):
    """A stale/mock id → Stripe 404 → False (so onboarding re-provisions)."""
    monkeypatch.setattr(stripe_connect, "_enabled", lambda: True)

    def _boom(_path):
        raise _http_error(404)

    monkeypatch.setattr(stripe_connect, "_get", _boom)
    assert stripe_connect.account_exists("acct_mock_dead") is False

    # 400 "No such account" is treated the same way.
    def _boom_400(_path):
        raise _http_error(400)

    monkeypatch.setattr(stripe_connect, "_get", _boom_400)
    assert stripe_connect.account_exists("acct_mock_dead") is False


def test_account_exists_true_on_transient_error(monkeypatch):
    """A 5xx/transient error must NOT discard a real account id."""
    monkeypatch.setattr(stripe_connect, "_enabled", lambda: True)

    def _boom(_path):
        raise _http_error(500)

    monkeypatch.setattr(stripe_connect, "_get", _boom)
    assert stripe_connect.account_exists("acct_real_123") is True


def test_get_account_status_not_ready_on_error(monkeypatch):
    """Stale id / Stripe error → all-False status instead of raising (no 500)."""
    monkeypatch.setattr(stripe_connect, "_enabled", lambda: True)

    def _boom(_path):
        raise _http_error(404)

    monkeypatch.setattr(stripe_connect, "_get", _boom)
    st = stripe_connect.get_account_status("acct_mock_dead")
    assert st == {
        "payouts_enabled": False,
        "charges_enabled": False,
        "details_submitted": False,
        "card_issuing_active": False,
    }


# ---------------------------------------------------------------------------
# card_issuing capability + individual address (Issuing onboarding — Sprint 72)
# ---------------------------------------------------------------------------

def test_get_account_status_reports_card_issuing(monkeypatch):
    monkeypatch.setattr(stripe_connect, "_enabled", lambda: True)
    monkeypatch.setattr(stripe_connect, "_get", lambda _p: {
        "payouts_enabled": True, "charges_enabled": True,
        "details_submitted": True, "capabilities": {"card_issuing": "active"},
    })
    assert stripe_connect.get_account_status("acct_1")["card_issuing_active"] is True

    monkeypatch.setattr(stripe_connect, "_get", lambda _p: {
        "capabilities": {"card_issuing": "inactive"},
    })
    assert stripe_connect.get_account_status("acct_1")["card_issuing_active"] is False


def test_get_account_status_card_issuing_true_in_dev(monkeypatch):
    monkeypatch.setattr(stripe_connect, "_enabled", lambda: False)
    assert stripe_connect.get_account_status("x")["card_issuing_active"] is True


def test_get_individual_address(monkeypatch):
    monkeypatch.setattr(stripe_connect, "_enabled", lambda: True)
    monkeypatch.setattr(stripe_connect, "_get", lambda _p: {"individual": {"address": {
        "line1": "5 Market St", "city": "Newark", "state": "NJ",
        "postal_code": "07102", "country": "US",
    }}})
    a = stripe_connect.get_individual_address("acct_1")
    assert a["line1"] == "5 Market St" and a["country"] == "US"


def test_get_individual_address_none_when_missing(monkeypatch):
    monkeypatch.setattr(stripe_connect, "_enabled", lambda: True)
    monkeypatch.setattr(stripe_connect, "_get", lambda _p: {"individual": {"address": {}}})
    assert stripe_connect.get_individual_address("acct_1") is None


def test_get_individual_address_none_in_dev(monkeypatch):
    monkeypatch.setattr(stripe_connect, "_enabled", lambda: False)
    assert stripe_connect.get_individual_address("acct_1") is None


def _capture_account_create(monkeypatch) -> dict:
    """Run create_connected_account with Stripe 'enabled' and capture the POST."""
    captured = {}
    monkeypatch.setattr(stripe_connect, "_enabled", lambda: True)

    def _fake_post(path, fields):
        captured["path"] = path
        captured["fields"] = fields
        return {"id": "acct_test_123"}

    monkeypatch.setattr(stripe_connect, "_post", _fake_post)
    acct = stripe_connect.create_connected_account("driver@ziza.dev")
    assert acct == "acct_test_123"
    return captured["fields"]


def test_create_connected_account_custom_payload(monkeypatch):
    """With Stripe enabled, the account is created as Custom (transfers capability)."""
    monkeypatch.setattr(stripe_connect.settings, "stripe_issuing_enabled", False)
    f = _capture_account_create(monkeypatch)
    # Custom controller configuration (no express type)
    assert "type" not in f
    assert f["controller[stripe_dashboard][type]"] == "none"
    assert f["controller[losses][payments]"] == "application"
    assert f["controller[requirement_collection]"] == "application"
    # transfers is always requested (receives the split)
    assert f["capabilities[transfers][requested]"] == "true"
    assert f["email"] == "driver@ziza.dev"


def test_card_issuing_not_requested_by_default(monkeypatch):
    """Issuing disabled (default) → card_issuing NOT requested, or Stripe rejects
    the whole account creation (platform not onboarded on Issuing)."""
    monkeypatch.setattr(stripe_connect.settings, "stripe_issuing_enabled", False)
    f = _capture_account_create(monkeypatch)
    assert "capabilities[card_issuing][requested]" not in f


def test_card_issuing_requested_when_enabled(monkeypatch):
    """Issuing enabled (platform onboarded) → card_issuing capability requested."""
    monkeypatch.setattr(stripe_connect.settings, "stripe_issuing_enabled", True)
    f = _capture_account_create(monkeypatch)
    assert f["capabilities[card_issuing][requested]"] == "true"
