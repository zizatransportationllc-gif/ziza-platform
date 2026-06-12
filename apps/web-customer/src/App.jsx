import { useEffect, useState, useCallback, useRef } from "react";
import {
  login, signup, exchangeFirebaseToken, fetchMe, fetchDemo, registerUser, fetchEstimate, createTrip, getTrip, cancelTrip, rateTrip,
  listMyTrips,
  validatePromo, getProfile, updateProfile,
  listNotifications, getUnreadCount, markAllRead,
  listPlaces, createPlace, updatePlace, deletePlace,
  listCategories, getTripEta, getTripTracking,
  listTripMessages, sendTripMessage,
  createPaymentIntent, getTripPayment, simulatePayment,
  registerDeviceToken,
  submitApplication, getApplicationStatus, // Sprint 30
  getWallet, topupWallet, getWalletTransactions, // Sprint 33
  searchPlaces, // Sprint 43
  checkPointInService, // Sprint 45
  createCraftRequest, getMyCraftRequests, getCraftRequestBids, selectCraftBid, cancelCraftRequest, // Sprint 48
  listRequestMessages, sendRequestMessage, // Sprint 66
  submitDocument, listMyDocuments, // Sprint 53
} from "./api";
import { firebaseEnabled, signInWithGoogle, signUpEmail, signInEmail, firebaseSignOut } from "./auth";
import { EstimateMap, TripMap } from "./TripMap";

const REQUIRED_ROLE = "customer";
const TOKEN_KEY = "ziza_token";

// Sprint 20 — saved places constants
const PLACE_LABEL_ICONS = { home: "🏠", work: "💼", other: "📍" };
const PLACE_LABEL_NAMES = { home: "Home", work: "Work", other: "Other" };

// Sprint 21 — vehicle category constants
const CATEGORY_ICONS  = { economy: "🚗", comfort: "🚙", premium: "🏎️" };
const CATEGORY_ORDER  = ["economy", "comfort", "premium"];

const STATUS_LABELS = {
  pending:     "⏳ Waiting for a driver",
  accepted:    "✓ Driver on the way",
  in_progress: "🚗 Ride in progress",
  completed:   "✅ Ride completed",
  cancelled:   "✗ Ride cancelled",
};

const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

function formatUSD(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({ onEmailLogin, onGoogleLogin, onSignup, error, loading }) {
  const [tab, setTab] = useState("signin");
  // Sign-in fields
  const [email, setEmail] = useState("customer@ziza.dev");
  const [password, setPassword] = useState("ziza2024");
  // Sign-up fields
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suFirstName, setSuFirstName] = useState("");
  const [suLastName, setSuLastName] = useState("");
  const [suBirthDate, setSuBirthDate] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suError, setSuError] = useState(null);

  function handleSignup(e) {
    e.preventDefault();
    setSuError(null);
    if (!suFirstName.trim()) { setSuError("First name is required"); return; }
    if (!suLastName.trim()) { setSuError("Last name is required"); return; }
    if (!suBirthDate) { setSuError("Date of birth is required"); return; }
    if (suPassword !== suConfirm) { setSuError("Passwords do not match"); return; }
    if (suPassword.length < 6) { setSuError("Password must be at least 6 characters"); return; }
    onSignup(suEmail, suPassword, suFirstName.trim(), suLastName.trim(), suBirthDate, suPhone);
  }

  return (
    <div className="app">
      <img src="/logo-customer.svg" alt="Ziza Customer" className="app-logo" />
      <p className="subtitle">Sprint 64 — Profile Fields</p>
      <div className="auth-tabs">
        <button className={`auth-tab${tab === "signin" ? " active" : ""}`} onClick={() => setTab("signin")}>Sign In</button>
        <button className={`auth-tab${tab === "signup" ? " active" : ""}`} onClick={() => setTab("signup")}>Create Account</button>
      </div>
      {tab === "signin" ? (
        <>
          <form className="login-form" onSubmit={(e) => { e.preventDefault(); onEmailLogin(email, password); }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
            <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign In"}</button>
          </form>
          {firebaseEnabled && (
            <button className="google-btn" onClick={onGoogleLogin} disabled={loading}>
              <span>G</span> Continue with Google
            </button>
          )}
          {error && <p className="form-error">{error}</p>}
          <p className="hint">Dev: customer@ziza.dev / ziza2024</p>
        </>
      ) : (
        <>
          <form className="login-form" onSubmit={handleSignup}>
            <input type="text" value={suFirstName} onChange={(e) => setSuFirstName(e.target.value)} placeholder="First name" required />
            <input type="text" value={suLastName} onChange={(e) => setSuLastName(e.target.value)} placeholder="Last name" required />
            <input type="date" value={suBirthDate} onChange={(e) => setSuBirthDate(e.target.value)} placeholder="Date of birth" required />
            <input type="email" value={suEmail} onChange={(e) => setSuEmail(e.target.value)} placeholder="Email address" required />
            <input type="password" value={suPassword} onChange={(e) => setSuPassword(e.target.value)} placeholder="Password (min. 6 characters)" required />
            <input type="password" value={suConfirm} onChange={(e) => setSuConfirm(e.target.value)} placeholder="Confirm password" required />
            <input type="tel" value={suPhone} onChange={(e) => setSuPhone(e.target.value)} placeholder="Phone number (optional)" />
            <button type="submit" disabled={loading}>{loading ? "Creating account…" : "Create Account"}</button>
          </form>
          {(suError || error) && <p className="form-error">{suError || error}</p>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddressInput — Sprint 43: debounced autocomplete + GPS button
//               Sprint 45: zone warning prop
// ---------------------------------------------------------------------------

function AddressInput({ icon, placeholder, value, onSelect, token, onGps, zoneWarning }) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Sync label when external value changes (e.g. GPS or saved-place set it)
  useEffect(() => { setQuery(value?.name ?? ""); }, [value]);

  function handleChange(e) {
    const q = e.target.value;
    setQuery(q);
    onSelect(null); // clear current selection
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchPlaces(token, q);
        setSuggestions(results);
      } catch { setSuggestions([]); }
      finally { setSearching(false); }
    }, 350);
  }

  function handleSelectSuggestion(place) {
    setQuery(place.name);
    setSuggestions([]);
    onSelect({ lat: place.lat, lng: place.lng, name: place.name });
  }

  function handleBlur() {
    // delay so onMouseDown on suggestion fires first
    setTimeout(() => setSuggestions([]), 180);
  }

  return (
    <div className="address-input-wrap">
      <div className="address-input-row">
        <span className="address-input-icon">{icon}</span>
        <input
          className={`address-input${value ? " address-input-set" : ""}`}
          value={query}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          autoComplete="off"
        />
        {onGps && (
          <button
            type="button"
            className="address-gps-btn"
            onClick={onGps}
            title="Use my GPS location"
          >
            📡
          </button>
        )}
        {searching && <span className="address-loading">…</span>}
        {value && (
          <button
            type="button"
            className="address-clear-btn"
            onClick={() => { setQuery(""); setSuggestions([]); onSelect(null); }}
            title="Clear"
          >✕</button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="address-suggestions">
          {suggestions.map((s) => (
            <button
              key={s.place_id}
              type="button"
              className="address-suggestion-item"
              onMouseDown={() => handleSelectSuggestion(s)}
            >
              <span className="address-suggestion-name">
                {s.name.length > 55 ? s.name.slice(0, 55) + "…" : s.name}
              </span>
            </button>
          ))}
        </div>
      )}
      {/* Sprint 45: zone warning shown below the input row */}
      {zoneWarning && (
        <p className="address-zone-warning">{zoneWarning}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estimate form + fare card + "Book" button
// ---------------------------------------------------------------------------

function EstimateSection({ token, onTripCreated }) {
  const [origin, setOrigin] = useState(null); // { name, lat, lng } | null
  const [dest, setDest]     = useState(null); // { name, lat, lng } | null
  const [gpsLoading, setGpsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError]   = useState(null);
  // Promo code state — Sprint 14
  const [promoInput, setPromoInput] = useState("");
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoApplied, setPromoApplied] = useState(null); // { code, discount_pct }
  const [promoError, setPromoError] = useState(null);
  // Sprint 20: saved-places quick-pick
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [showPlacePicker, setShowPlacePicker] = useState(false);
  // Sprint 21: vehicle category
  const [selectedCategory, setSelectedCategory] = useState("economy");
  // Sprint 45: zone coverage state — null=unchecked, true=ok, false=outside
  const [originInZone, setOriginInZone] = useState(null);
  const [destInZone, setDestInZone]     = useState(null);

  useEffect(() => {
    listPlaces(token).then(setSavedPlaces).catch(() => {});
  }, [token]);

  // Sprint 45: zone check helpers (fail-open — don't block on API error)
  async function checkOriginZone(place) {
    if (!place) { setOriginInZone(null); return; }
    try {
      const r = await checkPointInService(place.lat, place.lng);
      setOriginInZone(r.in_service !== false);
    } catch { setOriginInZone(true); }
  }

  async function checkDestZone(place) {
    if (!place) { setDestInZone(null); return; }
    try {
      const r = await checkPointInService(place.lat, place.lng);
      setDestInZone(r.in_service !== false);
    } catch { setDestInZone(true); }
  }

  async function handleGps() {
    if (!navigator.geolocation) { setError("GPS not supported by your browser."); return; }
    setGpsLoading(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const place = { lat, lng, name: `My location (${lat.toFixed(4)}, ${lng.toFixed(4)})` };
        setOrigin(place);
        setResult(null);
        setGpsLoading(false);
        await checkOriginZone(place);
      },
      (err) => {
        setError(`GPS error: ${err.message}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!origin || !dest) { setError("Set both pickup and drop-off locations."); return; }
    if (origin.lat === dest.lat && origin.lng === dest.lng) { setError("Choose two different locations."); return; }
    if (originInZone === false || destInZone === false) {
      setError("One or more locations are outside our service area. Please choose addresses within a covered zone.");
      return;
    }
    setLoading(true); setError(null); setResult(null); setPromoApplied(null); setPromoInput(""); setSelectedCategory("economy");
    try {
      const data = await fetchEstimate(token, origin.lat, origin.lng, dest.lat, dest.lng);
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleValidatePromo(e) {
    e.preventDefault();
    if (!promoInput.trim()) return;
    setPromoValidating(true); setPromoError(null); setPromoApplied(null);
    try {
      const p = await validatePromo(token, promoInput.trim());
      setPromoApplied(p);
    } catch (err) { setPromoError(err.message); }
    finally { setPromoValidating(false); }
  }

  async function handleBook() {
    setBooking(true); setError(null);
    try {
      const trip = await createTrip(token, result.estimate_id, promoApplied?.code ?? null, selectedCategory);
      onTripCreated(trip);
    } catch (err) { setError(err.message); }
    finally { setBooking(false); }
  }

  // Sprint 21: use category-specific fare as the base
  const baseFare = result?.categories?.[selectedCategory]?.fare_xof ?? result?.fare_xof;
  // Compute displayed fare (with or without promo)
  const displayFare = promoApplied && result
    ? Math.max(1, Math.round(baseFare * (1 - promoApplied.discount_pct / 100)))
    : baseFare;

  return (
    <div className="estimate-section">
      <h2 className="estimate-title">Estimate My Ride</h2>

      {/* Sprint 20: saved-places quick-pick */}
      {savedPlaces.length > 0 && (
        <div className="place-picker-bar">
          <button
            type="button"
            className="place-picker-toggle"
            onClick={() => setShowPlacePicker((v) => !v)}
          >
            📍 My Saved Places {showPlacePicker ? "▲" : "▼"}
          </button>
          {showPlacePicker && (
            <div className="place-picker-list">
              {savedPlaces.map((p) => (
                <div key={p.place_id} className="place-picker-item">
                  <span className="place-picker-name">
                    {PLACE_LABEL_ICONS[p.label]} {p.name}
                  </span>
                  <button
                    type="button"
                    className={`place-picker-btn ${origin?.place_id === p.place_id ? "active" : ""}`}
                    onClick={() => { setOrigin({ ...p }); setShowPlacePicker(false); setResult(null); }}
                  >
                    Pickup
                  </button>
                  <button
                    type="button"
                    className={`place-picker-btn ${dest?.place_id === p.place_id ? "active" : ""}`}
                    onClick={() => { setDest({ ...p }); setShowPlacePicker(false); setResult(null); }}
                  >
                    Drop-off
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sprint 43: address inputs with autocomplete + GPS
          Sprint 45: zone check after selection */}
      <form className="estimate-form" onSubmit={handleSubmit}>
        <AddressInput
          icon="📍"
          placeholder="Pickup address…"
          value={origin}
          onSelect={(v) => { setOrigin(v); setResult(null); checkOriginZone(v); }}
          token={token}
          onGps={gpsLoading ? null : handleGps}
          zoneWarning={originInZone === false ? "⚠️ This pickup is outside our service area." : null}
        />
        {gpsLoading && <p className="address-gps-hint">📡 Detecting your location…</p>}
        <AddressInput
          icon="🏁"
          placeholder="Drop-off address…"
          value={dest}
          onSelect={(v) => { setDest(v); setResult(null); checkDestZone(v); }}
          token={token}
          zoneWarning={destInZone === false ? "⚠️ This drop-off is outside our service area." : null}
        />
        <button
          type="submit"
          className="estimate-btn"
          disabled={loading || booking || !origin || !dest || originInZone === false || destInZone === false}
        >
          {loading ? "Calculating…" : "Get Estimate"}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {result && (
        <div className="fare-card">
          {promoApplied && (
            <div className="promo-applied-badge">
              🏷️ Code <strong>{promoApplied.code}</strong> — {promoApplied.discount_pct}% off
            </div>
          )}
          <div className="fare-amount">
            {promoApplied && (
              <span className="fare-original">{formatUSD(baseFare)}</span>
            )}
            {formatUSD(displayFare)}
          </div>
          <div className="fare-meta">
            <span>🛣️ {result.distance_km.toFixed(1)} mi</span>
            <span>⏱️ ~{result.duration_min} min</span>
            {result.surge_multiplier > 1 && (
              <span className="surge">🔥 ×{result.surge_multiplier} surge</span>
            )}
          </div>
          <div className="fare-source">
            {result.distance_source === "google_maps" ? "🗺️ Google Maps" : "📐 Estimated distance"}
          </div>

          {/* Sprint 21: category picker */}
          {result.categories && (
            <div className="category-picker">
              <div className="category-picker-label">Choose your ride type</div>
              <div className="category-cards">
                {CATEGORY_ORDER.map((cat) => {
                  const opt = result.categories[cat];
                  if (!opt) return null;
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      className={`category-card category-card-${cat} ${isSelected ? "category-card-selected" : ""}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      <span className="category-card-icon">{CATEGORY_ICONS[cat]}</span>
                      <span className="category-card-name">{opt.label}</span>
                      <span className="category-card-fare">{formatUSD(opt.fare_xof)}</span>
                      <span className="category-card-desc">{opt.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Promo code input */}
          {!promoApplied && (
            <form className="promo-form" onSubmit={handleValidatePromo}>
              <input
                className="promo-input"
                placeholder="Promo code (optional)"
                value={promoInput}
                onChange={(e) => { setPromoInput(e.target.value); setPromoError(null); }}
                maxLength={32}
              />
              <button type="submit" className="promo-btn" disabled={promoValidating || !promoInput.trim()}>
                {promoValidating ? "…" : "Apply"}
              </button>
            </form>
          )}
          {promoApplied && (
            <button
              className="promo-remove-btn"
              onClick={() => { setPromoApplied(null); setPromoInput(""); }}
            >
              ✕ Remove code
            </button>
          )}
          {promoError && <p className="promo-error">{promoError}</p>}
          {/* Map preview — origin / destination */}
          {origin && dest && (
            <EstimateMap
              originLat={origin.lat} originLng={origin.lng}
              destLat={dest.lat}     destLng={dest.lng}
            />
          )}

          <button className="book-btn" onClick={handleBook} disabled={booking}>
            {booking ? "Booking…" : "🚕 Book This Ride"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rating form — shown after trip is completed
// ---------------------------------------------------------------------------

function RatingForm({ token, tripId }) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rated, setRated] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (stars === 0) { setError("Please select a rating."); return; }
    setLoading(true); setError(null);
    try {
      await rateTrip(token, tripId, stars, comment || undefined);
      setRated(true);
    } catch (err) {
      // 409 = already rated — treat as success
      if (err.message.includes("409") || err.message.toLowerCase().includes("already")) {
        setRated(true);
      } else {
        setError(err.message);
      }
    } finally { setLoading(false); }
  }

  if (rated) {
    return (
      <div className="rating-success">
        <div className="rating-success-icon">⭐</div>
        <p>Thank you for your review!</p>
      </div>
    );
  }

  return (
    <form className="rating-form" onSubmit={handleSubmit}>
      <h3 className="rating-title">Rate Your Driver</h3>
      <div className="star-picker">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star ${n <= (hover || stars) ? "filled" : ""}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setStars(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="rating-comment"
        placeholder="Comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        maxLength={500}
      />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="estimate-btn" disabled={loading || stars === 0}>
        {loading ? "Sending…" : "Submit"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Payment section — Sprint 24
// ---------------------------------------------------------------------------

function PaymentSection({ token, tripId, fareXof }) {
  const [intent, setIntent] = useState(null);      // PaymentIntentResponse | null
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState(null);

  // On mount: check if a payment already exists for this trip
  useEffect(() => {
    async function checkExisting() {
      try {
        const data = await getTripPayment(token, tripId);
        if (data) setIntent(data);
      } catch (_) {}
    }
    checkExisting();
  }, [tripId]);

  // Poll every 5s while status is pending (waiting for webhook)
  useEffect(() => {
    if (!intent || intent.status !== "pending") return;
    const id = setInterval(async () => {
      try {
        const data = await getTripPayment(token, tripId);
        if (data) setIntent(data);
      } catch (_) {}
    }, 5000);
    return () => clearInterval(id);
  }, [tripId, intent?.status]);

  async function handlePay() {
    setLoading(true); setError(null);
    try {
      const data = await createPaymentIntent(token, tripId);
      setIntent(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleSimulate() {
    if (!intent) return;
    setSimulating(true); setError(null);
    try {
      await simulatePayment(intent.provider_ref);
      // Refresh intent status
      const data = await getTripPayment(token, tripId);
      if (data) setIntent(data);
    } catch (err) { setError(err.message); }
    finally { setSimulating(false); }
  }

  if (intent && intent.status === "paid") {
    return (
      <div className="payment-section">
        <div className="payment-card payment-card-paid">
          <span className="payment-icon">✅</span>
          <div className="payment-info">
            <div className="payment-status-paid">Payment confirmed</div>
            <div className="payment-amount">{formatUSD(intent.amount_xof)}</div>
          </div>
        </div>
      </div>
    );
  }

  if (intent && intent.status === "failed") {
    return (
      <div className="payment-section">
        <div className="payment-card payment-card-failed">
          <span className="payment-icon">❌</span>
          <div className="payment-info">
            <div className="payment-status-failed">Payment failed</div>
            <div className="payment-amount">{formatUSD(intent.amount_xof)}</div>
          </div>
        </div>
        <button className="payment-btn" onClick={handlePay} disabled={loading}>
          {loading ? "Loading…" : "🔄 Retry"}
        </button>
      </div>
    );
  }

  if (intent && intent.status === "pending") {
    const isMock = intent.checkout_url && intent.checkout_url.includes("localhost");
    const providerLabel = intent.provider === "cinetpay" ? "CinetPay (Mobile Money)" : intent.provider;
    return (
      <div className="payment-section">
        <div className="payment-card">
          <span className="payment-icon">💳</span>
          <div className="payment-info">
            <div className="payment-label">Payment pending…</div>
            <div className="payment-amount">{formatUSD(intent.amount_xof)}</div>
          </div>
        </div>
        {isMock && (
          <button
            className="payment-btn payment-btn-simulate"
            onClick={handleSimulate}
            disabled={simulating}
          >
            {simulating ? "Simulating…" : "🧪 Simulate Payment (dev)"}
          </button>
        )}
        {!isMock && intent.checkout_url && (
          <a
            className="payment-btn"
            href={intent.checkout_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Pay via {providerLabel}
          </a>
        )}
        <p className="payment-hint">
          This page updates automatically after payment confirmation.
        </p>
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }

  // No intent yet — show Pay button
  return (
    <div className="payment-section">
      <button
        className="payment-btn"
        onClick={handlePay}
        disabled={loading}
      >
        {loading ? "Loading…" : `💳 Pay ${formatUSD(fareXof || 0)}`}
      </button>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Chat panel — Sprint 66 (in-app messaging, polling every 3s)
// ---------------------------------------------------------------------------

function ChatPanel({ token, tripId, accent = "#F97316" }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    let active = true;
    const load = () => listTripMessages(token, tripId).then((m) => { if (active) setMessages(m); }).catch(() => {});
    load();
    const iv = setInterval(load, 3000);
    return () => { active = false; clearInterval(iv); };
  }, [token, tripId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function handleSend(e) {
    e.preventDefault();
    const body = input.trim();
    if (!body) return;
    setSending(true); setError(null);
    try {
      const msg = await sendTripMessage(token, tripId, body);
      setMessages((prev) => [...prev, msg]);
      setInput("");
    } catch (err) { setError(err.message); }
    finally { setSending(false); }
  }

  return (
    <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <div style={{ padding: "8px 12px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 14 }}>💬 Chat</div>
      <div style={{ maxHeight: 220, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {messages.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No messages yet. Say hello 👋</p>}
        {messages.map((m) => (
          <div key={m.message_id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "78%", padding: "7px 11px", borderRadius: 14, fontSize: 14, background: m.mine ? accent : "#f1f5f9", color: m.mine ? "#fff" : "#111827" }}>
            {m.body}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSend} style={{ display: "flex", gap: 6, padding: 8, borderTop: "1px solid #e5e7eb" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message…" maxLength={4000} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }} />
        <button type="submit" disabled={sending || !input.trim()} style={{ background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 600, cursor: "pointer" }}>Send</button>
      </form>
      {error && <p className="form-error" style={{ padding: "0 10px 8px" }}>{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking status card — shows trip state + cancel + 5-second polling
// ---------------------------------------------------------------------------

function BookingSection({ token, trip, onTripUpdate, onNewEstimate }) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);
  const [eta, setEta] = useState(null); // { distance_km, eta_min } | null — Sprint 22
  const [driverLocation, setDriverLocation] = useState(null); // Sprint 23 — live driver position

  // Poll trip status every 5 s until terminal state
  useEffect(() => {
    if (TERMINAL_STATUSES.has(trip.status)) return;
    const id = setInterval(async () => {
      try {
        const updated = await getTrip(token, trip.trip_id);
        onTripUpdate(updated);
      } catch (_) { /* swallow polling errors */ }
    }, 5000);
    return () => clearInterval(id);
  }, [trip.trip_id, trip.status]);

  // Sprint 22: Poll ETA every 15 s when driver is assigned
  useEffect(() => {
    if (!["accepted", "in_progress"].includes(trip.status)) { setEta(null); return; }
    async function fetchEta() {
      try {
        const data = await getTripEta(token, trip.trip_id);
        setEta(data);
      } catch (_) {}
    }
    fetchEta();
    const id = setInterval(fetchEta, 15000);
    return () => clearInterval(id);
  }, [trip.trip_id, trip.status]);

  // Sprint 23: Poll driver's live position every 5 s when trip is active
  useEffect(() => {
    if (!["accepted", "in_progress"].includes(trip.status)) { setDriverLocation(null); return; }
    async function fetchTracking() {
      try {
        const data = await getTripTracking(token, trip.trip_id);
        if (data) setDriverLocation(data);
      } catch (_) {}
    }
    fetchTracking();
    const id = setInterval(fetchTracking, 5000);
    return () => clearInterval(id);
  }, [trip.trip_id, trip.status]);

  async function handleCancel() {
    setCancelling(true); setError(null);
    try {
      const updated = await cancelTrip(token, trip.trip_id);
      onTripUpdate(updated);
    } catch (err) { setError(err.message); }
    finally { setCancelling(false); }
  }

  const canCancel = ["pending", "accepted"].includes(trip.status);

  return (
    <div className="booking-section">
      <h2 className="estimate-title">My Ride</h2>
      <div className={`booking-card booking-${trip.status}`}>
        <div className="booking-status">
          {STATUS_LABELS[trip.status] ?? trip.status}
        </div>
        {trip.fare_xof && (
          <div className="booking-fare">{formatUSD(trip.fare_xof)}</div>
        )}
        <div className="fare-meta">
          {trip.distance_km != null && <span>🛣️ {trip.distance_km.toFixed(1)} mi</span>}
          {trip.duration_min != null && <span>⏱️ ~{trip.duration_min} min</span>}
        </div>
        {trip.category && (
          <div className={`booking-category booking-category-${trip.category}`}>
            {CATEGORY_ICONS[trip.category] ?? "🚗"} {trip.category.charAt(0).toUpperCase() + trip.category.slice(1)}
          </div>
        )}
        {/* Sprint 22: ETA card */}
        {eta && (
          <div className="eta-card">
            <span className="eta-icon">🚗</span>
            <div className="eta-info">
              <span className="eta-time">~{eta.eta_min} min</span>
              <span className="eta-dist">{eta.distance_km.toFixed(1)} mi</span>
            </div>
            <span className="eta-label">
              {trip.status === "accepted" ? "until pickup" : "until arrival"}
            </span>
          </div>
        )}
        {/* Sprint 23: Live driver tracking card */}
        {driverLocation && (
          <div className="tracking-card">
            <span className="tracking-icon">📍</span>
            <div className="tracking-info">
              <div className="tracking-coords">
                {driverLocation.driver_lat.toFixed(5)}, {driverLocation.driver_lng.toFixed(5)}
              </div>
              {driverLocation.eta_min != null && (
                <div className="tracking-eta">ETA: ~{driverLocation.eta_min} min</div>
              )}
              {driverLocation.updated_at && (
                <div className="tracking-updated">
                  Updated: {new Date(driverLocation.updated_at).toLocaleTimeString("en-US")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live map — driver position + route */}
        <TripMap trip={trip} driverLocation={driverLocation} />
        {trip.vehicle && (trip.status === "accepted" || trip.status === "in_progress") && (
          <div className="vehicle-badge">
            <span className="vehicle-badge-plate">🚗 {trip.vehicle.plate}</span>
            {(trip.vehicle.color || trip.vehicle.make || trip.vehicle.model) && (
              <span className="vehicle-badge-meta">
                {[trip.vehicle.color, trip.vehicle.make, trip.vehicle.model, trip.vehicle.year]
                  .filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        )}
      </div>
      {(trip.status === "accepted" || trip.status === "in_progress") && (
        <ChatPanel token={token} tripId={trip.trip_id} accent="#F97316" />
      )}
      {error && <p className="form-error">{error}</p>}
      {canCancel && (
        <button className="cancel-btn" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? "Cancelling…" : "Cancel Ride"}
        </button>
      )}
      {trip.status === "completed" && (
        <PaymentSection token={token} tripId={trip.trip_id} fareXof={trip.fare_xof} />
      )}
      {trip.status === "completed" && (
        <RatingForm token={token} tripId={trip.trip_id} />
      )}
      {TERMINAL_STATUSES.has(trip.status) && (
        <button
          className="estimate-btn"
          onClick={onNewEstimate}
          style={{ marginTop: "var(--space-4)" }}
        >
          New Estimate
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trip history — Sprint 13 / Sprint 42: payment status badges
// ---------------------------------------------------------------------------

const TRIP_PAGE = 10;

function TripHistory({ token }) {
  const [trips, setTrips] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState(null);

  const load = useCallback(async (p = 0) => {
    setLoading(true); setError(null);
    try {
      const data = await listMyTrips(token, TRIP_PAGE, p * TRIP_PAGE);
      setTrips(data);
      setPage(p);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  async function handlePay(tripId) {
    setPayingId(tripId); setPayError(null);
    try {
      const intent = await createPaymentIntent(token, tripId);
      // Open checkout URL in a new tab; payment status will update on next reload
      if (intent.checkout_url && !intent.checkout_url.includes("localhost")) {
        window.open(intent.checkout_url, "_blank", "noopener");
      } else {
        // Dev/mock: simulate inline
        await simulatePayment(intent.provider_ref);
        await load(page);
      }
    } catch (e) { setPayError(e.message); }
    finally { setPayingId(null); }
  }

  if (loading && trips.length === 0) return <p className="history-empty">⏳ Loading…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (trips.length === 0) return <p className="history-empty">No trips yet.</p>;

  return (
    <>
      {payError && <p className="form-error">{payError}</p>}
      <div className="history-list">
        {trips.map((t) => {
          const isPaid = !!t.paid_at;
          const canPay = t.status === "completed" && !isPaid;
          return (
            <div key={t.trip_id} className={`history-item history-item-${t.status}`}>
              <div className="history-item-header">
                <div className="history-type">{STATUS_LABELS[t.status] ?? t.status}</div>
                {isPaid && (
                  <span className="history-paid-badge">💳 Paid</span>
                )}
              </div>
              {t.fare_xof && (
                <div className="history-fare">{formatUSD(t.fare_xof)}</div>
              )}
              <div className="history-meta">
                {t.distance_km != null && <span>🛣️ {t.distance_km.toFixed(1)} mi</span>}
                {t.duration_min != null && <span>⏱️ {t.duration_min} min</span>}
              </div>
              <div className="history-date">
                {new Date(t.created_at).toLocaleDateString("en-US", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
              </div>
              {canPay && (
                <button
                  className="history-pay-btn"
                  onClick={() => handlePay(t.trip_id)}
                  disabled={payingId === t.trip_id}
                >
                  {payingId === t.trip_id ? "Loading…" : "💳 Pay Now"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {(trips.length === TRIP_PAGE || page > 0) && (
        <div className="trip-history-pagination">
          <button className="page-btn-sm" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info-sm">Page {page + 1}</span>
          <button className="page-btn-sm" onClick={() => load(page + 1)} disabled={trips.length < TRIP_PAGE || loading}>Next →</button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Profile section — Sprint 16
// ---------------------------------------------------------------------------

function ProfileSection({ token }) {
  const [profile, setProfile] = useState(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    getProfile(token)
      .then((p) => {
        setProfile(p);
        setFirstName(p.first_name || "");
        setLastName(p.last_name || "");
        setBirthDate(p.date_of_birth || "");
        setName(p.name || "");
        setPhone(p.phone || "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError(null); setSuccess(false);
    try {
      const updated = await updateProfile(token, {
        first_name: firstName || null,
        last_name: lastName || null,
        date_of_birth: birthDate || null,
        name: name || null,
        phone: phone || null,
      });
      setProfile(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="history-empty">⏳ Loading profile…</p>;
  if (error && !profile) return <p className="form-error">{error}</p>;

  return (
    <div className="profile-section">
      <h2 className="estimate-title">👤 My Profile</h2>
      {profile && (
        <div className="profile-info">
          <span className="profile-email">✉️ {profile.email}</span>
          <span className="profile-role">{profile.role}</span>
        </div>
      )}
      <form className="profile-form" onSubmit={handleSave}>
        <label className="profile-label">
          <span>First name</span>
          <input
            className="profile-input"
            type="text"
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={64}
          />
        </label>
        <label className="profile-label">
          <span>Last name</span>
          <input
            className="profile-input"
            type="text"
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={64}
          />
        </label>
        <label className="profile-label">
          <span>Date of birth</span>
          <input
            className="profile-input"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </label>
        <label className="profile-label">
          <span>Display Name</span>
          <input
            className="profile-input"
            type="text"
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={128}
          />
        </label>
        <label className="profile-label">
          <span>Phone</span>
          <input
            className="profile-input"
            type="tel"
            placeholder="+1 (201) 555-0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={32}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        {success && <p className="profile-success">✓ Profile updated</p>}
        <button type="submit" className="estimate-btn" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications section — Sprint 18
// ---------------------------------------------------------------------------

const NOTIF_TYPE_ICONS = {
  trip_accepted:    "🚗",
  trip_completed:   "✅",
  document_approved: "✅",
  document_rejected: "❌",
};

const NOTIF_PAGE = 10;

function NotificationsSection({ token, onRead }) {
  const [notifs, setNotifs] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (p = 0) => {
    setLoading(true); setError(null);
    try {
      const data = await listNotifications(token, NOTIF_PAGE, p * NOTIF_PAGE);
      setNotifs(data); setPage(p);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  async function handleMarkAll() {
    setMarking(true);
    try {
      await markAllRead(token);
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
      onRead();
    } catch (_) {}
    finally { setMarking(false); }
  }

  const unreadCount = notifs.filter((n) => !n.read).length;

  return (
    <div className="notif-section">
      <div className="notif-header">
        <h2 className="estimate-title">🔔 Notifications</h2>
        {unreadCount > 0 && (
          <button className="notif-mark-btn" onClick={handleMarkAll} disabled={marking}>
            {marking ? "…" : `Mark all read (${unreadCount})`}
          </button>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && <p className="history-empty">⏳ Loading…</p>}
      {!loading && notifs.length === 0 && (
        <p className="history-empty">No notifications yet.</p>
      )}
      <div className="notif-list">
        {notifs.map((n) => (
          <div key={n.notification_id} className={`notif-item ${n.read ? "notif-read" : "notif-unread"}`}>
            <div className="notif-item-header">
              <span className="notif-icon">{NOTIF_TYPE_ICONS[n.type] ?? "🔔"}</span>
              <span className="notif-title">{n.title}</span>
              {!n.read && <span className="notif-dot" />}
            </div>
            <p className="notif-body">{n.body}</p>
            <span className="notif-date">
              {new Date(n.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
        ))}
      </div>
      {(notifs.length === NOTIF_PAGE || page > 0) && (
        <div className="trip-history-pagination">
          <button className="page-btn-sm" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info-sm">Page {page + 1}</span>
          <button className="page-btn-sm" onClick={() => load(page + 1)} disabled={notifs.length < NOTIF_PAGE || loading}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved places section — Sprint 20
// ---------------------------------------------------------------------------

function SavedPlacesSection({ token }) {
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  // Form fields
  const [formLabel, setFormLabel] = useState("home");
  const [formName, setFormName] = useState("");
  const [formLandmark, setFormLandmark] = useState(LOCATION_NAMES[0]);
  const [formLat, setFormLat] = useState("40.7357");
  const [formLng, setFormLng] = useState("-74.1724");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPlaces(await listPlaces(token)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function handleLandmarkChange(name) {
    setFormLandmark(name);
    const c = NJ_LOCATIONS[name];
    setFormLat(String(c.lat));
    setFormLng(String(c.lng));
  }

  function openNew() {
    setEditingId(null);
    setFormLabel("home");
    setFormName("");
    setFormLandmark(LOCATION_NAMES[0]);
    setFormLat("40.7357");
    setFormLng("-74.1724");
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(p) {
    setEditingId(p.place_id);
    setFormLabel(p.label);
    setFormName(p.name);
    setFormLandmark(LOCATION_NAMES[0]); // keep dropdown for reference
    setFormLat(String(p.lat));
    setFormLng(String(p.lng));
    setFormError(null);
    setShowForm(true);
  }

  function cancelForm() { setShowForm(false); setEditingId(null); }

  async function handleSave(e) {
    e.preventDefault();
    const lat = parseFloat(formLat);
    const lng = parseFloat(formLng);
    if (isNaN(lat) || isNaN(lng)) { setFormError("Invalid coordinates."); return; }
    setSaving(true); setFormError(null);
    try {
      if (editingId) {
        const updated = await updatePlace(token, editingId, {
          label: formLabel, name: formName.trim(), lat, lng,
        });
        setPlaces((prev) => prev.map((p) => p.place_id === editingId ? updated : p));
      } else {
        const created = await createPlace(token, formLabel, formName.trim(), lat, lng);
        setPlaces((prev) => [...prev, created]);
      }
      setShowForm(false); setEditingId(null);
    } catch (e) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(placeId) {
    try {
      await deletePlace(token, placeId);
      setPlaces((prev) => prev.filter((p) => p.place_id !== placeId));
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="places-section">
      <div className="places-header">
        <h2 className="estimate-title">📍 My Places</h2>
        {!showForm && places.length < 10 && (
          <button className="places-add-btn" onClick={openNew}>✚ Add</button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {showForm && (
        <form className="place-form" onSubmit={handleSave}>
          <h3 className="place-form-title">
            {editingId ? "✎ Edit Place" : "✚ New Place"}
          </h3>
          <div className="place-form-row">
            <label className="place-form-label">Type</label>
            <select className="place-form-select" value={formLabel} onChange={(e) => setFormLabel(e.target.value)}>
              <option value="home">🏠 Home</option>
              <option value="work">💼 Work</option>
              <option value="other">📍 Other</option>
            </select>
          </div>
          <div className="place-form-row">
            <label className="place-form-label">Name</label>
            <input
              className="place-form-input"
              type="text"
              placeholder="Ex: Home Jersey City, Office Newark…"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required maxLength={256}
            />
          </div>
          <div className="place-form-row">
            <label className="place-form-label">Area</label>
            <select
              className="place-form-select"
              value={formLandmark}
              onChange={(e) => handleLandmarkChange(e.target.value)}
            >
              {LOCATION_NAMES.map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div className="place-form-coords">
            <input
              className="place-form-coord-input"
              type="number" step="0.0001" placeholder="Latitude"
              value={formLat} onChange={(e) => setFormLat(e.target.value)} required
            />
            <input
              className="place-form-coord-input"
              type="number" step="0.0001" placeholder="Longitude"
              value={formLng} onChange={(e) => setFormLng(e.target.value)} required
            />
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <div className="place-form-actions">
            <button type="submit" className="place-save-btn" disabled={saving}>
              {saving ? "…" : (editingId ? "✓ Update" : "✚ Save")}
            </button>
            <button type="button" className="place-cancel-btn" onClick={cancelForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && <p className="history-empty">⏳ Loading…</p>}
      {!loading && places.length === 0 && !showForm && (
        <p className="history-empty">
          No saved places. Click <strong>✚ Add</strong> to save your frequent addresses.
        </p>
      )}

      <div className="place-list">
        {places.map((p) => (
          <div key={p.place_id} className={`place-card place-card-${p.label}`}>
            <div className="place-card-main">
              <span className="place-card-icon">{PLACE_LABEL_ICONS[p.label] ?? "📍"}</span>
              <div className="place-card-info">
                <span className="place-card-name">{p.name}</span>
                <span className="place-card-meta">{PLACE_LABEL_NAMES[p.label] ?? p.label}</span>
              </div>
            </div>
            <div className="place-card-actions">
              <button className="place-edit-btn" onClick={() => openEdit(p)} title="Edit">✎</button>
              <button className="place-delete-btn" onClick={() => handleDelete(p.place_id)} title="Delete">🗑</button>
            </div>
          </div>
        ))}
      </div>

      {places.length >= 10 && !showForm && (
        <p className="place-limit-hint">10 places limit reached.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Application Section — Sprint 30
// ---------------------------------------------------------------------------

const APPLICATION_STATUS_LABELS = {
  submitted:    "📤 Submitted — pending review",
  under_review: "🔍 Under review",
  approved:     "✅ Approved — welcome to Ziza!",
  rejected:     "✗ Rejected",
};

const VEHICLE_CATEGORIES_APP = [
  { value: "economy", label: "🚗 Economy" },
  { value: "comfort", label: "🚙 Comfort" },
  { value: "premium", label: "🏎️ Premium" },
];

function ApplicationSection({ token }) {
  const [application, setApplication] = useState(undefined); // undefined = loading
  const [step, setStep] = useState("status"); // "status" | "form"
  const [formData, setFormData] = useState({
    full_name: "", phone: "", license_number: "",
    vehicle_make: "", vehicle_model: "", vehicle_plate: "",
    vehicle_year: new Date().getFullYear() - 2, vehicle_category: "economy",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await getApplicationStatus(token);
      setApplication(data);
    } catch {
      setApplication(null);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function updateField(key, value) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const result = await submitApplication(token, {
        ...formData,
        vehicle_year: parseInt(formData.vehicle_year, 10),
      });
      setApplication(result);
      setStep("status");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (application === undefined) return <div className="status loading">⏳ Loading…</div>;

  // Existing application — show status
  if (application && step === "status") {
    return (
      <div className="application-section">
        <h2 className="application-title">🧑‍✈️ Driver Application</h2>
        <div className={`application-status application-status-${application.status}`}>
          <span>{APPLICATION_STATUS_LABELS[application.status] ?? application.status}</span>
        </div>
        <div className="application-info">
          <div className="application-row"><span>Name</span><strong>{application.full_name}</strong></div>
          <div className="application-row"><span>Phone</span><strong>{application.phone}</strong></div>
          <div className="application-row"><span>Vehicle</span><strong>{application.vehicle_make} {application.vehicle_model} ({application.vehicle_year})</strong></div>
          <div className="application-row"><span>Plate</span><strong>{application.vehicle_plate}</strong></div>
          <div className="application-row"><span>Category</span><strong>{application.vehicle_category}</strong></div>
        </div>
        {application.notes_admin && (
          <div className="application-note">💬 Admin note: {application.notes_admin}</div>
        )}
        {application.status === "approved" && (
          <p className="application-hint">Your account will be set up as a driver on your next login.</p>
        )}
      </div>
    );
  }

  // No application yet — show form
  return (
    <div className="application-section">
      <h2 className="application-title">🧑‍✈️ Become a Ziza Driver</h2>
      <p className="application-subtitle">Fill out the form to submit your application.</p>
      <form className="application-form" onSubmit={handleSubmit}>
        <fieldset className="application-fieldset">
          <legend>Personal Information</legend>
          <label className="application-label">
            Full Name
            <input className="application-input" type="text" value={formData.full_name}
              onChange={(e) => updateField("full_name", e.target.value)} required minLength={2} />
          </label>
          <label className="application-label">
            Phone
            <input className="application-input" type="tel" value={formData.phone}
              onChange={(e) => updateField("phone", e.target.value)} required placeholder="+12015550000" />
          </label>
          <label className="application-label">
            Driver&apos;s License Number
            <input className="application-input" type="text" value={formData.license_number}
              onChange={(e) => updateField("license_number", e.target.value)} required />
          </label>
        </fieldset>

        <fieldset className="application-fieldset">
          <legend>Vehicle</legend>
          <div className="application-grid2">
            <label className="application-label">
              Make
              <input className="application-input" type="text" value={formData.vehicle_make}
                onChange={(e) => updateField("vehicle_make", e.target.value)} required placeholder="Toyota" />
            </label>
            <label className="application-label">
              Model
              <input className="application-input" type="text" value={formData.vehicle_model}
                onChange={(e) => updateField("vehicle_model", e.target.value)} required placeholder="Camry" />
            </label>
          </div>
          <div className="application-grid2">
            <label className="application-label">
              License Plate
              <input className="application-input" type="text" value={formData.vehicle_plate}
                onChange={(e) => updateField("vehicle_plate", e.target.value)} required placeholder="ABC 1234" />
            </label>
            <label className="application-label">
              Year
              <input className="application-input" type="number" value={formData.vehicle_year}
                onChange={(e) => updateField("vehicle_year", e.target.value)} required min={1990} max={2030} />
            </label>
          </div>
          <label className="application-label">
            Category
            <select className="application-select" value={formData.vehicle_category}
              onChange={(e) => updateField("vehicle_category", e.target.value)}>
              {VEHICLE_CATEGORIES_APP.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
        </fieldset>

        {error && <p className="form-error">{error}</p>}
        <button className="application-submit-btn" type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Application"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WalletSection — Sprint 33
// ---------------------------------------------------------------------------

function WalletSection({ token }) {
  const [wallet, setWallet] = useState(null);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topping, setTopping] = useState(false);
  const [topupSuccess, setTopupSuccess] = useState(null);
  const [topupError, setTopupError] = useState(null);

  const TX_ICONS = { credit: "⬆️", debit: "⬇️", refund: "↩️" };
  const TX_COLORS = { credit: "#16a34a", debit: "#dc2626", refund: "#2563eb" };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [w, t] = await Promise.all([getWallet(token), getWalletTransactions(token, 10)]);
      setWallet(w); setTxs(t);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleTopup(e) {
    e.preventDefault();
    const amount = parseFloat(topupAmount);
    if (!amount || amount <= 0) return;
    setTopping(true); setTopupError(null); setTopupSuccess(null);
    try {
      const result = await topupWallet(token, amount);
      setWallet(result.wallet);
      setTxs((prev) => [result.transaction, ...prev]);
      setTopupAmount("");
      setTopupSuccess(`✅ Top-up of ${formatUSD(amount)} completed!`);
    } catch (err) { setTopupError(err.message); }
    finally { setTopping(false); }
  }

  if (loading) return <div className="status loading">⏳ Loading wallet…</div>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <div className="wallet-section">
      <h2 className="estimate-title">💰 My Wallet</h2>

      {wallet && (
        <div className="wallet-balance-card">
          <p className="wallet-balance-label">Available Balance</p>
          <p className="wallet-balance-amount">
            {formatUSD(wallet.balance_xof)}
          </p>
        </div>
      )}

      <form className="wallet-topup-form" onSubmit={handleTopup}>
        <h3 className="wallet-subtitle">Top Up Your Wallet</h3>
        {topupError && <p className="form-error">{topupError}</p>}
        {topupSuccess && <p className="form-success">{topupSuccess}</p>}
        <div className="wallet-topup-row">
          <input
            type="number"
            min="100"
            step="100"
            className="wallet-amount-input"
            placeholder="Amount in cents (100 = $1.00)"
            value={topupAmount}
            onChange={(e) => setTopupAmount(e.target.value)}
            required
          />
          <button type="submit" className="booking-btn" disabled={topping}>
            {topping ? "Processing…" : "Top Up"}
          </button>
        </div>
        <p className="wallet-note">💳 Apple Pay · Google Pay · Credit / Debit Card</p>
      </form>

      <div className="wallet-history">
        <h3 className="wallet-subtitle">Transaction History</h3>
        {txs.length === 0 && <p className="muted-text">No transactions yet.</p>}
        {txs.map((tx) => (
          <div key={tx.tx_id} className="wallet-tx-row">
            <span className="wallet-tx-icon">{TX_ICONS[tx.tx_type] ?? "•"}</span>
            <div className="wallet-tx-details">
              <span className="wallet-tx-reason">{tx.reason.replace("_", " ")}</span>
              {tx.reference_id && <span className="wallet-tx-ref">#{tx.reference_id.slice(-8)}</span>}
            </div>
            <span className="wallet-tx-amount" style={{ color: TX_COLORS[tx.tx_type] }}>
              {tx.tx_type === "debit" ? "−" : "+"}{formatUSD(tx.amount_xof)}
            </span>
            <span className="wallet-tx-time">
              {new Date(tx.created_at).toLocaleDateString("en-US", { day: "2-digit", month: "short" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Craft / Maintenance section — Sprint 48
// ---------------------------------------------------------------------------

const CRAFT_CATEGORIES = [
  "breakdown", "flat_tyre", "tow", "fuel", "lockout", "battery", "accident", "diagnostics", "other",
];
const CRAFT_CAT_LABELS = {
  breakdown:   "🔧 Breakdown",
  flat_tyre:   "🔴 Flat Tire",
  tow:         "🚛 Towing",
  fuel:        "⛽ Out of Fuel",
  lockout:     "🔑 Lockout",
  battery:     "🔋 Dead Battery",
  accident:    "🚨 Post-Accident",
  diagnostics: "🔍 Diagnostics",
  other:       "🛠️ Other",
};
const CRAFT_STATUS_LABELS = {
  open:           "🟢 Open — accepting bids",
  bidding_closed: "⏰ Bidding closed",
  assigned:       "✅ Professional assigned",
  in_progress:    "🔧 In progress",
  completed:      "✅ Completed",
  cancelled:      "✗ Cancelled",
};

// Chat panel for a craft request conversation — Sprint 66 (polling 3s)
function RequestChatPanel({ token, requestId, accent = "#F97316" }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    let active = true;
    const load = () => listRequestMessages(token, requestId).then((m) => { if (active) setMessages(m); }).catch(() => {});
    load();
    const iv = setInterval(load, 3000);
    return () => { active = false; clearInterval(iv); };
  }, [token, requestId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function handleSend(e) {
    e.preventDefault();
    const body = input.trim();
    if (!body) return;
    setSending(true); setError(null);
    try {
      const msg = await sendRequestMessage(token, requestId, body);
      setMessages((prev) => [...prev, msg]);
      setInput("");
    } catch (err) { setError(err.message); }
    finally { setSending(false); }
  }

  return (
    <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
      <div style={{ padding: "8px 12px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 14 }}>💬 Chat with your professional</div>
      <div style={{ maxHeight: 220, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {messages.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No messages yet. Say hello 👋</p>}
        {messages.map((m) => (
          <div key={m.message_id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "78%", padding: "7px 11px", borderRadius: 14, fontSize: 14, background: m.mine ? accent : "#f1f5f9", color: m.mine ? "#fff" : "#111827" }}>
            {m.body}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSend} style={{ display: "flex", gap: 6, padding: 8, borderTop: "1px solid #e5e7eb" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message…" maxLength={4000} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }} />
        <button type="submit" disabled={sending || !input.trim()} style={{ background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 600, cursor: "pointer" }}>Send</button>
      </form>
      {error && <p className="form-error" style={{ padding: "0 10px 8px" }}>{error}</p>}
    </div>
  );
}

// Bids view for a single craft request
function CraftBidsView({ token, request, onBack }) {
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    setLoading(true);
    getCraftRequestBids(token, request.request_id)
      .then(setBids)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, request.request_id]);

  async function handleSelect(bidId) {
    setSelecting(bidId); setError(null);
    try {
      await selectCraftBid(token, request.request_id, bidId);
      setSuccess("✅ Professional accepted! They will contact you shortly.");
    } catch (e) { setError(e.message); }
    finally { setSelecting(null); }
  }

  const canSelect = ["open", "bidding_closed"].includes(request.status);

  return (
    <div className="craft-detail">
      <button className="craft-back-btn" onClick={onBack}>← Back to my requests</button>
      <div className="craft-request-info">
        <span className="craft-cat-chip">{CRAFT_CAT_LABELS[request.category] ?? request.category}</span>
        <span className="craft-status-label">{CRAFT_STATUS_LABELS[request.status] ?? request.status}</span>
      </div>
      <p className="craft-description">{request.description}</p>
      {request.address && <p className="craft-meta">📍 {request.address}</p>}

      <h3 className="craft-bids-title">
        {bids.length > 0 ? `${bids.length} bid${bids.length > 1 ? "s" : ""}` : "No bids yet"}
      </h3>

      {success && <p className="craft-success">{success}</p>}
      {error   && <p className="form-error">{error}</p>}
      {loading && <p className="craft-loading">⏳ Loading bids…</p>}

      <div className="craft-bids-list">
        {bids.map((b) => (
          <div key={b.bid_id} className={`craft-bid-card ${b.status === "accepted" ? "craft-bid-accepted" : ""}`}>
            <div className="craft-bid-header">
              <span className="craft-bid-price">{formatUSD(b.price_cents)}</span>
              <span className="craft-bid-eta">⏱ {b.eta_min} min</span>
            </div>
            {b.note && <p className="craft-bid-note">💬 {b.note}</p>}
            {b.distance_km != null && (
              <p className="craft-bid-dist">📍 {b.distance_km.toFixed(1)} km away</p>
            )}
            {canSelect && b.status === "pending" && !success && (
              <button
                className="craft-bid-select-btn"
                onClick={() => handleSelect(b.bid_id)}
                disabled={selecting === b.bid_id}
              >
                {selecting === b.bid_id ? "Accepting…" : "✓ Accept this bid"}
              </button>
            )}
            {b.status === "accepted" && (
              <span className="craft-bid-accepted-label">✅ You accepted this bid</span>
            )}
          </div>
        ))}
      </div>
      {(success || bids.some((b) => b.status === "accepted")) && (
        <RequestChatPanel token={token} requestId={request.request_id} accent="#F97316" />
      )}
    </div>
  );
}

// New craft request form
function CraftNewRequestForm({ token, onCreated, onCancel }) {
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [gpsLabel, setGpsLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Auto-detect GPS silently when the form mounts
  useEffect(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLat(coords.latitude.toFixed(5));
        setLng(coords.longitude.toFixed(5));
        setGpsLabel("✓ GPS position detected");
        setLocating(false);
      },
      () => { setLocating(false); }, // silent failure — defaults used
      { timeout: 8000 },
    );
  }, []);

  function handleGPS() {
    if (!navigator.geolocation) { setError("Geolocation not available in this browser."); return; }
    setLocating(true); setError(null); setGpsLabel("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLat(coords.latitude.toFixed(5));
        setLng(coords.longitude.toFixed(5));
        setGpsLabel("✓ GPS position updated");
        setLocating(false);
      },
      () => { setError("Unable to get GPS position. You can still submit — a default location will be used."); setLocating(false); },
      { timeout: 10000 },
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!category) { setError("Please select a category."); return; }
    setSubmitting(true); setError(null);
    try {
      const req = await createCraftRequest(token, {
        category,
        description: description.trim(),
        lat: parseFloat(lat) || 40.7357,
        lng: parseFloat(lng) || -74.1724,
        address: address.trim() || null,
        bid_deadline_minutes: 30,
      });
      onCreated(req);
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="craft-form-wrap">
      <div className="craft-form-header">
        <h2 className="craft-form-title">🔧 Request Roadside Help</h2>
        <button className="craft-back-btn" onClick={onCancel}>✕ Cancel</button>
      </div>

      <form className="craft-form" onSubmit={handleSubmit}>
        {/* Category */}
        <div className="craft-field">
          <span className="craft-label">Type of problem</span>
          <div className="craft-cat-grid">
            {CRAFT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`craft-cat-btn ${category === cat ? "craft-cat-selected" : ""}`}
                onClick={() => setCategory(cat)}
              >
                {CRAFT_CAT_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="craft-field">
          <span className="craft-label">Describe the problem</span>
          <textarea
            className="craft-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Car won't start, clicking noise when turning key…"
            rows={3}
            maxLength={1000}
            required
          />
        </div>

        {/* Address */}
        <div className="craft-field">
          <span className="craft-label">Your address</span>
          <input
            className="craft-input"
            type="text"
            placeholder="e.g. 123 Main St, Newark NJ"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={500}
          />
        </div>

        {/* GPS location (button only — no manual lat/lng inputs) */}
        <div className="craft-field">
          <span className="craft-label">GPS location (optional)</span>
          <button type="button" className="craft-gps-btn" onClick={handleGPS} disabled={locating}>
            {locating ? "⏳ Detecting…" : "📍 Refresh GPS"}
          </button>
          {gpsLabel && <p className="craft-gps-ok">{gpsLabel}</p>}
        </div>

        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="craft-submit-btn" disabled={submitting || !category}>
          {submitting ? "Posting…" : "📤 Post Request"}
        </button>
      </form>
    </div>
  );
}

// Main craft section — list + new request + bids view
function CraftSection({ token }) {
  const [view, setView] = useState("list"); // "list" | "new" | "bids"
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [error, setError] = useState(null);

  const loadRequests = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await getMyCraftRequests(token);
      setRequests(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function handleCancel(requestId) {
    setCancelling(requestId);
    try {
      await cancelCraftRequest(token, requestId);
      loadRequests();
    } catch (_) {}
    finally { setCancelling(null); }
  }

  if (view === "new") {
    return (
      <CraftNewRequestForm
        token={token}
        onCreated={() => { setView("list"); loadRequests(); }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "bids" && selectedRequest) {
    return (
      <CraftBidsView
        token={token}
        request={selectedRequest}
        onBack={() => { setView("list"); loadRequests(); }}
      />
    );
  }

  // List view
  return (
    <div className="craft-section">
      <div className="craft-list-header">
        <h2 className="estimate-title">🔧 Maintenance</h2>
        <button className="craft-new-btn" onClick={() => setView("new")}>
          + New Request
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <p className="craft-loading">⏳ Loading…</p>}

      {!loading && requests.length === 0 && (
        <div className="craft-empty">
          <p>No maintenance requests yet.</p>
          <button className="craft-submit-btn" onClick={() => setView("new")}>
            Post Your First Request
          </button>
        </div>
      )}

      <div className="craft-list">
        {requests.map((req) => {
          const deadline = req.bid_deadline ? new Date(req.bid_deadline) : null;
          const isExpired = deadline && deadline < new Date();
          const canViewBids = ["open", "bidding_closed", "assigned"].includes(req.status);
          const canCancel = req.status === "open";

          return (
            <div key={req.request_id} className="craft-request-card">
              <div className="craft-request-header">
                <span className="craft-cat-chip">{CRAFT_CAT_LABELS[req.category] ?? req.category}</span>
                <span className="craft-status-badge">{CRAFT_STATUS_LABELS[req.status] ?? req.status}</span>
              </div>
              <p className="craft-request-desc">{req.description}</p>
              {req.address && <p className="craft-meta">📍 {req.address}</p>}
              {deadline && !isExpired && req.status === "open" && (
                <p className="craft-deadline">
                  ⏱ Bidding until: {deadline.toLocaleTimeString("en-US")}
                </p>
              )}
              {isExpired && req.status === "open" && (
                <p className="craft-expired">⏰ Bidding window closed</p>
              )}
              <p className="craft-date">
                Posted: {new Date(req.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
              </p>
              <div className="craft-request-actions">
                {canViewBids && (
                  <button
                    className="craft-view-bids-btn"
                    onClick={() => { setSelectedRequest(req); setView("bids"); }}
                  >
                    View Bids →
                  </button>
                )}
                {canCancel && (
                  <button
                    className="craft-cancel-btn"
                    onClick={() => handleCancel(req.request_id)}
                    disabled={cancelling === req.request_id}
                  >
                    {cancelling === req.request_id ? "Cancelling…" : "✕ Cancel"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents section — Sprint 53
// ---------------------------------------------------------------------------

const DOCUMENT_TYPES = ["license", "insurance", "registration", "id_card"];
const DOCUMENT_TYPE_LABELS = {
  license:      "🪪 Driver's License",
  insurance:    "🛡️ Vehicle Insurance",
  registration: "📋 Vehicle Registration",
  id_card:      "🪪 Government ID",
};
const DOCUMENT_STATUS_LABELS = {
  pending:  "⏳ Pending",
  approved: "✅ Approved",
  rejected: "✗ Rejected",
};

function DocumentsSection({ token }) {
  const [docs, setDocs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [docType, setDocType]     = useState("id_card");
  const [preview, setPreview]     = useState(null);
  const [fileName, setFileName]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]     = useState(null);
  const [error, setError]         = useState(null);

  const loadDocs = useCallback(() => {
    setLoading(true);
    listMyDocuments(token)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!preview) return;
    setSubmitting(true); setSuccess(null); setError(null);
    try {
      await submitDocument(token, docType, preview);
      setSuccess("✅ Document submitted!");
      setPreview(null);
      setFileName("");
      loadDocs();
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="documents-section">
      <h2 className="estimate-title">📄 My Documents</h2>

      <form className="doc-form" onSubmit={handleSubmit}>
        <select
          className="doc-type-select"
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
        >
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
          ))}
        </select>

        <div className="doc-capture-row">
          <label className="doc-capture-btn">
            📷 Camera
            <input type="file" accept="image/*" capture="environment" hidden onChange={handleFileChange} />
          </label>
          <label className="doc-capture-btn doc-file-btn">
            📁 File
            <input type="file" accept="image/*,application/pdf" hidden onChange={handleFileChange} />
          </label>
        </div>

        {preview && (
          <div className="doc-preview-wrap">
            <img src={preview} className="doc-preview-img" alt="Document preview" />
            <span className="doc-file-name">{fileName}</span>
          </div>
        )}

        {success && <p className="doc-success">{success}</p>}
        {error   && <p className="form-error">{error}</p>}

        <button
          type="submit"
          className="doc-submit-btn"
          disabled={submitting || !preview}
        >
          {submitting ? "Uploading…" : "⬆️ Submit Document"}
        </button>
      </form>

      <h3 className="doc-list-title">Submitted documents</h3>
      {loading && <p className="history-empty">⏳ Loading…</p>}
      {!loading && docs.length === 0 && (
        <p className="history-empty">No documents submitted yet.</p>
      )}
      <div className="doc-list">
        {docs.map((d, i) => (
          <div key={d.document_id ?? i} className="doc-item">
            <div className="doc-item-main">
              <span className="doc-type">{DOCUMENT_TYPE_LABELS[d.type] ?? d.type}</span>
              <span className={`doc-status doc-status-${d.status}`}>
                {DOCUMENT_STATUS_LABELS[d.status] ?? d.status}
              </span>
            </div>
            {d.admin_note && <p className="doc-note">💬 {d.admin_note}</p>}
            <p className="doc-date">{new Date(d.created_at).toLocaleDateString("en-US")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ user, token, onLogout }) {
  const [activeTrip, setActiveTrip] = useState(null);
  const [mode, setMode] = useState("ride"); // "ride" | "craft" | "trips" | "profile" | "notifications" | "places" | "apply" | "wallet" | "docs"
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(() => {
    getUnreadCount(token).then((d) => setUnreadCount(d.count)).catch(() => {});
  }, [token]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);
  useEffect(() => { refreshUnread(); }, [mode, refreshUnread]);

  // Derive which main section to show
  const showBooking = activeTrip && !TERMINAL_STATUSES.has(activeTrip.status);
  const showTabs    = !showBooking;

  return (
    <div className="app">
      <header className="dash-header">
        <h1>Ziza Customer</h1>
        <div className="dash-header-right">
          <button
            className={`bell-btn ${unreadCount > 0 ? "bell-btn-active" : ""}`}
            onClick={() => setMode("notifications")}
            title="Notifications"
          >
            🔔{unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
          </button>
          <button className="logout-btn" onClick={onLogout}>Sign Out</button>
        </div>
      </header>
      <div className="status ok">✓ Signed in — <strong>{user.email}</strong></div>
      <div className="role-badge">{user.role} · {user.provider}</div>

      {showBooking && (
        <BookingSection
          token={token}
          trip={activeTrip}
          onTripUpdate={setActiveTrip}
          onNewEstimate={() => setActiveTrip(null)}
        />
      )}

      {showTabs && (
        <>
          <div className="mode-tabs">
            <button
              className={`mode-tab ${mode === "ride" ? "active" : ""}`}
              onClick={() => setMode("ride")}
            >
              🚕 Ride
            </button>
            <button
              className={`mode-tab ${mode === "craft" ? "active" : ""}`}
              onClick={() => setMode("craft")}
            >
              🔧 Maintenance
            </button>
            <button
              className={`mode-tab ${mode === "trips" ? "active" : ""}`}
              onClick={() => setMode("trips")}
            >
              📜 My Trips
            </button>
            <button
              className={`mode-tab ${mode === "profile" ? "active" : ""}`}
              onClick={() => setMode("profile")}
            >
              👤 Profile
            </button>
            <button
              className={`mode-tab ${mode === "notifications" ? "active" : ""}`}
              onClick={() => setMode("notifications")}
            >
              🔔 Notifs{unreadCount > 0 && <span className="tab-badge-sm">{unreadCount}</span>}
            </button>
            <button
              className={`mode-tab ${mode === "places" ? "active" : ""}`}
              onClick={() => setMode("places")}
            >
              📍 Places
            </button>
            <button
              className={`mode-tab ${mode === "apply" ? "active" : ""}`}
              onClick={() => setMode("apply")}
            >
              🧑‍✈️ Become a Driver
            </button>
            <button
              className={`mode-tab ${mode === "wallet" ? "active" : ""}`}
              onClick={() => setMode("wallet")}
            >
              💰 Wallet
            </button>
            <button
              className={`mode-tab ${mode === "docs" ? "active" : ""}`}
              onClick={() => setMode("docs")}
            >
              📄 Docs
            </button>
          </div>
          {mode === "ride" && (
            <EstimateSection token={token} onTripCreated={setActiveTrip} />
          )}
          {mode === "craft" && <CraftSection token={token} />}
          {mode === "trips" && (
            <div className="history-section">
              <h2 className="estimate-title">My Trips</h2>
              <TripHistory token={token} />
            </div>
          )}
          {mode === "profile" && <ProfileSection token={token} />}
          {mode === "notifications" && (
            <NotificationsSection token={token} onRead={refreshUnread} />
          )}
          {mode === "places" && <SavedPlacesSection token={token} />}
          {mode === "apply" && <ApplicationSection token={token} />}
          {mode === "wallet" && <WalletSection token={token} />}
          {mode === "docs"   && <DocumentsSection token={token} />}
        </>
      )}

      <p className="footer">App: <strong>web-customer</strong> · Sprint 64 — Profile Fields</p>
    </div>
  );
}

function AccessDenied({ role, onLogout }) {
  return (
    <div className="app">
      <h1>Ziza Customer</h1>
      <div className="status error">✗ Access denied — expected role: {REQUIRED_ROLE} · you have: {role}</div>
      <button className="logout-btn" onClick={onLogout}>Sign Out</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (!token) { setUser(null); return; }
    fetchMe(token).then(setUser).catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); });
  }, [token]);

  useEffect(() => {
    if (!user || user.role !== REQUIRED_ROLE) return;
    registerUser(token).catch(() => {});
  }, [user]);

  // Sprint 26 — request web push permission and register device token
  useEffect(() => {
    if (!user || user.role !== REQUIRED_ROLE) return;
    if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
    if (Notification.permission === "denied") return;

    Notification.requestPermission().then(async (permission) => {
      if (permission !== "granted") return;
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        // Use the SW registration endpoint as the device token (web push)
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: undefined, // VAPID key would go here in production
        }).catch(() => null);
        const deviceToken = sub ? sub.endpoint : `web-${user.user_id}`;
        await registerDeviceToken(token, deviceToken, "web");
      } catch (_) {
        // Non-blocking — push is best-effort
      }
    }).catch(() => {});
  }, [user]);

  async function handleEmailLogin(email, password) {
    setLoginLoading(true); setLoginError(null);
    try {
      // Firebase identity when configured; /v1/token fallback for local dev.
      const { access_token } = firebaseEnabled
        ? await exchangeFirebaseToken(await signInEmail(email, password))
        : await login(email, password);
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginLoading(false); }
  }

  async function handleGoogleLogin() {
    setLoginLoading(true); setLoginError(null);
    try {
      const idToken = await signInWithGoogle();
      const { access_token } = await exchangeFirebaseToken(idToken);
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginLoading(false); }
  }

  async function handleSignup(email, password, firstName, lastName, birthDate, phone) {
    setLoginLoading(true); setLoginError(null);
    try {
      const { access_token } = firebaseEnabled
        ? await exchangeFirebaseToken(await signUpEmail(email, password), { firstName, lastName, birthDate, phone })
        : await signup(email, password, firstName, lastName, birthDate, phone || null);
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginLoading(false); }
  }

  async function handleLogout() {
    await firebaseSignOut();
    localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null);
  }

  if (!token) return <LoginForm onEmailLogin={handleEmailLogin} onGoogleLogin={handleGoogleLogin} onSignup={handleSignup} error={loginError} loading={loginLoading} />;
  if (!user)  return <div className="app"><div className="status loading">⏳ Loading…</div></div>;
  if (user.role !== REQUIRED_ROLE) return <AccessDenied role={user.role} onLogout={handleLogout} />;
  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}
