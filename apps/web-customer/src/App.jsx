import { useEffect, useState, useCallback, useRef } from "react";
import {
  login, signup, exchangeFirebaseToken, fetchMe, fetchDemo, registerUser, fetchEstimate, createTrip, getTrip, getActiveTrip, cancelTrip, confirmOnboard, rateTrip,
  listMyTrips,
  validatePromo, getProfile, updateProfile,
  avatarUploadUrl, getBankAccount, setBankAccount,
  listNotifications, getUnreadCount, markAllRead, deleteNotification,
  listPlaces, createPlace, updatePlace, deletePlace,
  listCategories, getTripEta, getTripTracking,
  listTripMessages, sendTripMessage,
  createPaymentIntent, getTripPayment, simulatePayment,
  registerDeviceToken,
  searchPlaces, reverseGeocode, // Sprint 43
  checkPointInService, // Sprint 45
  createCraftRequest, getMyCraftRequests, getCraftRequestBids, selectCraftBid, cancelCraftRequest, // Sprint 48
  getCraftRequest, craftConfirmArrival, craftComplete, listCraftPhotos, getCraftTracking, // craft lifecycle
  createCraftPaymentIntent, getCraftPayment, // craft payment
  listRequestMessages, sendRequestMessage, // Sprint 66
  submitDocument, listMyDocuments, // Sprint 53
  createSetupIntent, listPaymentMethods, deletePaymentMethod, setDefaultPaymentMethod, // Sprint 73 — saved cards
} from "./api";
import { firebaseEnabled, signInWithGoogle, signUpEmail, signInEmail, sendPasswordReset, resendVerification, changeEmail, firebaseSignOut } from "./auth";
import Icon from "./Icon";
import { EstimateMap, TripMap, CraftTrackingMap } from "./TripMap";

const REQUIRED_ROLE = "customer";
const TOKEN_KEY = "ziza_token";

// "Become a Driver" now redirects to the standalone web-driver app (sign-up tab).
// Baked at build time like VITE_API_URL; falls back to the local dev port.
const DRIVER_APP_URL = import.meta.env.VITE_DRIVER_URL || "http://localhost:3002";

// Sprint 20 — saved places constants
const PLACE_LABEL_ICONS = { home: "🏠", work: "💼", other: "📍" };
const PLACE_LABEL_NAMES = { home: "Home", work: "Work", other: "Other" };

// NJ landmark areas — used to prefill coordinates in the saved-places form.
const NJ_LOCATIONS = {
  "Newark": { lat: 40.7357, lng: -74.1724 },
  "Jersey City": { lat: 40.7178, lng: -74.0431 },
  "Hoboken": { lat: 40.7439, lng: -74.0324 },
  "Elizabeth": { lat: 40.6639, lng: -74.2107 },
  "Paterson": { lat: 40.9168, lng: -74.1718 },
  "Edison": { lat: 40.5187, lng: -74.4121 },
  "New Brunswick": { lat: 40.4862, lng: -74.4518 },
  "Trenton": { lat: 40.2171, lng: -74.7429 },
  "Atlantic City": { lat: 39.3643, lng: -74.4229 },
};
const LOCATION_NAMES = Object.keys(NJ_LOCATIONS);

// Sprint 21 — vehicle category constants
const CATEGORY_ICONS  = { economy: "🚗", comfort: "🚙", premium: "🏎️" };
const CATEGORY_ORDER  = ["economy", "comfort", "premium"];

const STATUS_LABELS = {
  pending:     "Waiting for a driver",
  accepted:    "Driver on the way",
  arrived:     "Your driver has arrived — confirm when you're in the car",
  in_progress: "Ride in progress",
  completed:   "Ride completed",
  cancelled:   "Ride cancelled",
};

const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

function formatUSD(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

// Price breakdown shown to the customer before/while paying (Sprint 70).
// Renders base fare/bid, optional platform fee (craft), tax, and total when the
// payment intent carries the split breakdown; renders nothing otherwise.
function PaymentBreakdown({ intent }) {
  if (!intent || intent.base_cents == null) return null;
  const rows = [["Base", intent.base_cents]];
  if (intent.platform_fee_cents != null) rows.push(["Service fee", intent.platform_fee_cents]);
  if (intent.tax_cents != null) rows.push(["Tax", intent.tax_cents]);
  return (
    <div className="payment-breakdown">
      {rows.map(([label, cents]) => (
        <div className="payment-breakdown-row" key={label}>
          <span>{label}</span>
          <span>{formatUSD(cents)}</span>
        </div>
      ))}
      <div className="payment-breakdown-row payment-breakdown-total">
        <span>Total</span>
        <span>{formatUSD(intent.amount_cents)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

// Distances are stored in km; display in miles (US). 1 mi = 1.609344 km.
const KM_TO_MI = 1 / 1.609344;
function fmtMiles(km) { return (km * KM_TO_MI).toFixed(1); }

// Password input with a "Show password" checkbox (toggles visibility).
function PasswordInput({ value, onChange, placeholder, required }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-field">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
      />
      <label className="password-toggle">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
        Show password
      </label>
    </div>
  );
}

function LoginForm({ onEmailLogin, onGoogleLogin, onSignup, error, notice, loading }) {
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
  const [resetMsg, setResetMsg] = useState(null);

  async function handleForgot() {
    setResetMsg(null);
    if (!email.trim()) { setResetMsg("Enter your email above, then tap again."); return; }
    try {
      await sendPasswordReset(email.trim());
      setResetMsg("Password reset email sent — check your inbox.");
    } catch (e) { setResetMsg(e.message || "Could not send reset email."); }
  }

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
      <div className="auth-tabs">
        <button className={`auth-tab${tab === "signin" ? " active" : ""}`} onClick={() => setTab("signin")}>Sign In</button>
        <button className={`auth-tab${tab === "signup" ? " active" : ""}`} onClick={() => setTab("signup")}>Create Account</button>
      </div>
      {tab === "signin" ? (
        <>
          <form className="login-form" onSubmit={(e) => { e.preventDefault(); onEmailLogin(email, password); }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
            <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign In"}</button>
          </form>
          {firebaseEnabled && (
            <button className="google-btn" onClick={onGoogleLogin} disabled={loading}>
              <span>G</span> Continue with Google
            </button>
          )}
          {firebaseEnabled && (
            <button type="button" className="link-btn" onClick={handleForgot}>Forgot password?</button>
          )}
          {resetMsg && <p className="hint">{resetMsg}</p>}
          {notice && <p className="verify-notice">{notice}</p>}
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
            <PasswordInput value={suPassword} onChange={(e) => setSuPassword(e.target.value)} placeholder="Password (min. 6 characters)" required />
            <PasswordInput value={suConfirm} onChange={(e) => setSuConfirm(e.target.value)} placeholder="Confirm password" required />
            <input type="tel" value={suPhone} onChange={(e) => setSuPhone(e.target.value)} placeholder="Phone number (optional)" />
            <button type="submit" disabled={loading}>{loading ? "Creating account…" : "Create Account"}</button>
          </form>
          {notice && <p className="verify-notice">{notice}</p>}
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
              <span className="address-suggestion-pin">📍</span>
              <span className="address-suggestion-text">
                <span className="address-suggestion-primary">{s.primary ?? s.name}</span>
                {s.secondary && (
                  <span className="address-suggestion-secondary">{s.secondary}</span>
                )}
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

function EstimateSection({ token, onTripCreated, onNeedCard }) {
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

  async function handleGps(silent = false) {
    if (!navigator.geolocation) { if (!silent) setError("GPS not supported by your browser."); return; }
    setGpsLoading(true); if (!silent) setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        // Reverse-geocode to a real street address so the driver sees the same
        // pickup label (fall back to coordinates if it can't be resolved).
        const resolved = await reverseGeocode(token, lat, lng);
        const name = resolved?.name || `My location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        const place = { lat, lng, name };
        setOrigin(place);
        setResult(null);
        setGpsLoading(false);
        await checkOriginZone(place);
      },
      (err) => {
        if (!silent) setError(`GPS error: ${err.message}`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Auto-detect the pickup from GPS on first load (silent; user can change it).
  const autoGpsRef = useRef(false);
  useEffect(() => {
    if (autoGpsRef.current || origin) return;
    autoGpsRef.current = true;
    handleGps(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const trip = await createTrip(token, result.estimate_id, promoApplied?.code ?? null, selectedCategory, {
        originAddress: origin?.name ?? null,
        destAddress: dest?.name ?? null,
      });
      onTripCreated(trip);
    } catch (err) {
      setError(err.message);
      // Sprint 73 — no saved card → send them to the Payment tab to add one.
      if (/payment card/i.test(err.message || "") && onNeedCard) onNeedCard();
    }
    finally { setBooking(false); }
  }

  // Sprint 21: use category-specific fare as the base
  const baseFare = result?.categories?.[selectedCategory]?.fare_cents ?? result?.fare_cents;
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
          onGps={gpsLoading ? null : () => handleGps(false)}
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
            <span>🛣️ {fmtMiles(result.distance_km)} mi</span>
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
                      <span className="category-card-fare">{formatUSD(opt.fare_cents)}</span>
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
            <div className="payment-amount">{formatUSD(intent.amount_cents)}</div>
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
            <div className="payment-amount">{formatUSD(intent.amount_cents)}</div>
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
            <div className="payment-amount">{formatUSD(intent.amount_cents)}</div>
          </div>
        </div>
        <PaymentBreakdown intent={intent} />
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

  // Authorized (hold placed at driver-accept) — captured on completion.
  if (intent && intent.status === "authorized") {
    return (
      <div className="payment-section">
        <div className="payment-card">
          <span className="payment-icon">💳</span>
          <div className="payment-info">
            <div className="payment-label">Held on your card — charged when the ride completes</div>
            <div className="payment-amount">{formatUSD(intent.amount_cents)}</div>
          </div>
        </div>
      </div>
    );
  }

  // Sprint 73 — rides are charged automatically to the saved card; no manual pay.
  return (
    <div className="payment-section">
      <p className="payment-hint">
        💳 Your ride is charged automatically to your saved card when it completes.
        Add or manage cards in the <strong>Payment</strong> tab.
      </p>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Chat panel — Sprint 66 (in-app messaging, polling every 3s)
// ---------------------------------------------------------------------------

function ChatPanel({ token, tripId, accent = "#4c82f0" }) {
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
  const [boarding, setBoarding] = useState(false);
  const [error, setError] = useState(null);
  const [eta, setEta] = useState(null); // { distance_km, eta_min } | null — Sprint 22
  const [driverLocation, setDriverLocation] = useState(null); // Sprint 23 — live driver position
  const [driverAddr, setDriverAddr] = useState(null); // reverse-geocoded driver address

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
    if (!["accepted", "arrived", "in_progress"].includes(trip.status)) { setEta(null); return; }
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
    if (!["accepted", "arrived", "in_progress"].includes(trip.status)) { setDriverLocation(null); return; }
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

  // Reverse-geocode the driver's live position to an address (only when the
  // position changes by ~10 m, to limit lookups).
  const driverGeoKey = driverLocation
    ? `${driverLocation.driver_lat.toFixed(4)},${driverLocation.driver_lng.toFixed(4)}` : null;
  useEffect(() => {
    if (!driverLocation) { setDriverAddr(null); return; }
    let active = true;
    reverseGeocode(token, driverLocation.driver_lat, driverLocation.driver_lng)
      .then((r) => { if (active && r?.name) setDriverAddr(r.name); })
      .catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, driverGeoKey]);

  async function handleCancel() {
    setCancelling(true); setError(null);
    try {
      const updated = await cancelTrip(token, trip.trip_id);
      onTripUpdate(updated);
    } catch (err) { setError(err.message); }
    finally { setCancelling(false); }
  }

  // Customer confirms they are aboard → starts leg 2 (pickup → destination).
  async function handleBoard() {
    setBoarding(true); setError(null);
    try {
      const updated = await confirmOnboard(token, trip.trip_id);
      onTripUpdate(updated);
    } catch (err) { setError(err.message); }
    finally { setBoarding(false); }
  }

  const canCancel = ["pending", "accepted", "arrived"].includes(trip.status);

  return (
    <div className="booking-section">
      <h2 className="estimate-title">My Ride</h2>
      <div className={`booking-card booking-${trip.status}`}>
        <div className="booking-status">
          {STATUS_LABELS[trip.status] ?? trip.status}
        </div>
        {trip.fare_cents && (
          <div className="booking-fare">{formatUSD(trip.fare_cents)}</div>
        )}
        <div className="fare-meta">
          {trip.distance_km != null && <span>🛣️ {fmtMiles(trip.distance_km)} mi</span>}
          {trip.duration_min != null && <span>⏱️ ~{trip.duration_min} min</span>}
        </div>
        {trip.category && (
          <div className={`booking-category booking-category-${trip.category}`}>
            {CATEGORY_ICONS[trip.category] ?? "🚗"} {trip.category.charAt(0).toUpperCase() + trip.category.slice(1)}
          </div>
        )}
        {/* Per-trip verification code — share with the driver to confirm pickup */}
        {trip.verification_code && ["accepted", "arrived", "in_progress"].includes(trip.status) && (
          <div className="verify-code-card">
            <span className="verify-code-label">🔐 Verification code</span>
            <span className="verify-code-value">{trip.verification_code}</span>
            <span className="verify-code-hint">Share this with your driver to confirm your ride.</span>
          </div>
        )}
        {/* Sprint 22: ETA card */}
        {eta && (
          <div className="eta-card">
            <span className="eta-icon">🚗</span>
            <div className="eta-info">
              <span className="eta-time">~{eta.eta_min} min</span>
              <span className="eta-dist">{fmtMiles(eta.distance_km)} mi</span>
            </div>
            <span className="eta-label">
              {["accepted", "arrived"].includes(trip.status) ? "until pickup" : "until arrival"}
            </span>
          </div>
        )}
        {/* Sprint 23: Live driver tracking card */}
        {driverLocation && (
          <div className="tracking-card">
            <span className="tracking-icon">📍</span>
            <div className="tracking-info">
              <div className="tracking-coords">
                {driverAddr ?? `${driverLocation.driver_lat.toFixed(5)}, ${driverLocation.driver_lng.toFixed(5)}`}
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
        {trip.vehicle && (trip.status === "accepted" || trip.status === "arrived" || trip.status === "in_progress") && (
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
      {/* Gate: confirm pickup to start the ride (driver → destination) */}
      {trip.status === "arrived" && (
        <button className="board-btn" onClick={handleBoard} disabled={boarding}>
          {boarding ? "Confirming…" : "✅ I'm in the car"}
        </button>
      )}
      {(trip.status === "accepted" || trip.status === "arrived" || trip.status === "in_progress") && (
        <ChatPanel token={token} tripId={trip.trip_id} accent="#4c82f0" />
      )}
      {error && <p className="form-error">{error}</p>}
      {canCancel && (
        <button className="cancel-btn" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? "Cancelling…" : "Cancel Ride"}
        </button>
      )}
      {trip.status === "completed" && (
        <PaymentSection token={token} tripId={trip.trip_id} fareXof={trip.fare_cents} />
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
              {t.fare_cents && (
                <div className="history-fare">{formatUSD(t.fare_cents)}</div>
              )}
              <div className="history-meta">
                {t.distance_km != null && <span>🛣️ {fmtMiles(t.distance_km)} mi</span>}
                {t.duration_min != null && <span>⏱️ {t.duration_min} min</span>}
              </div>
              <div className="history-date">
                {new Date(t.created_at).toLocaleDateString("en-US", {
                  day: "2-digit", month: "short", year: "numeric",
                })}
              </div>
              {canPay && (
                <span className="history-pay-note" style={{ color: "#6b7280", fontSize: 12 }}>
                  💳 Charged automatically
                </span>
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

function BankAccountForm({ token }) {
  const [bank, setBank] = useState(undefined);
  const [holder, setHolder] = useState("");
  const [routing, setRouting] = useState("");
  const [number, setNumber] = useState("");
  const [type, setType] = useState("checking");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    getBankAccount(token).then((b) => { setBank(b); if (b) setHolder(b.account_holder_name || ""); })
      .catch(() => setBank(null));
  }, [token]);

  async function save(e) {
    e.preventDefault();
    setSaving(true); setErr(null); setMsg(null);
    try {
      const b = await setBankAccount(token, {
        account_holder_name: holder, routing_number: routing, account_number: number, account_type: type,
      });
      setBank(b); setNumber(""); setMsg("✓ Bank account saved");
      setTimeout(() => setMsg(null), 3000);
    } catch (e2) { setErr(e2.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="profile-section" style={{ marginTop: 16 }}>
      <h2 className="estimate-title">🏦 Bank account</h2>
      {bank && (
        <p style={{ fontSize: 13, opacity: 0.85 }}>
          On file: {bank.account_holder_name} · ****{bank.account_number_last4} ({bank.account_type})
        </p>
      )}
      <form className="profile-form" onSubmit={save}>
        <label className="profile-label"><span>Account holder name</span>
          <input className="profile-input" value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={128} required />
        </label>
        <label className="profile-label"><span>Routing number</span>
          <input className="profile-input" value={routing} onChange={(e) => setRouting(e.target.value)} maxLength={34} required placeholder="021000021" />
        </label>
        <label className="profile-label"><span>Account number</span>
          <input className="profile-input" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={64} required placeholder={bank ? "Enter to replace" : "Account number"} />
        </label>
        <label className="profile-label"><span>Account type</span>
          <select className="profile-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
          </select>
        </label>
        {err && <p className="form-error">{err}</p>}
        {msg && <p className="profile-success">{msg}</p>}
        <button type="submit" className="estimate-btn" disabled={saving}>{saving ? "Saving…" : "Save bank account"}</button>
      </form>
    </div>
  );
}

// Sprint 67 — change the account e-mail via Firebase (verify-before-update).
function ChangeEmailBox() {
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  if (!firebaseEnabled) return null;

  async function submit(e) {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (!newEmail.trim()) { setErr("Enter a new email."); return; }
    setBusy(true);
    try {
      await changeEmail(newEmail.trim());
      setMsg(`Confirmation link sent to ${newEmail.trim()}. Click it, then sign in again with your new email.`);
      setNewEmail(""); setOpen(false);
    } catch (e2) {
      setErr(e2.message || "Could not change email.");
    } finally { setBusy(false); }
  }

  return (
    <div className="change-email-box">
      {!open ? (
        <button type="button" className="link-btn" onClick={() => { setOpen(true); setMsg(null); setErr(null); }}>
          ✉️ Change email
        </button>
      ) : (
        <form className="change-email-form" onSubmit={submit}>
          <input
            className="profile-input" type="email" placeholder="New email address"
            value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required
          />
          <div className="change-email-actions">
            <button type="submit" className="place-save-btn" disabled={busy}>{busy ? "…" : "Send confirmation"}</button>
            <button type="button" className="place-cancel-btn" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}
      {msg && <p className="verify-notice">{msg}</p>}
      {err && <p className="form-error">{err}</p>}
    </div>
  );
}

function ProfileSection({ token }) {
  const [profile, setProfile] = useState(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [gpsBusy, setGpsBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
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
        setHomeAddress(p.home_address || "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAvatar(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setAvatarBusy(true); setError(null);
    try {
      const ct = file.type || "image/jpeg";
      const { upload_url, final_url } = await avatarUploadUrl(token, file.name, ct);
      await fetch(upload_url, { method: "PUT", headers: { "Content-Type": ct }, body: file });
      const updated = await updateProfile(token, { avatar_url: final_url });
      setProfile(updated);
    } catch (err) { setError("Photo upload failed: " + err.message); }
    finally { setAvatarBusy(false); }
  }

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
        home_address: homeAddress || null,
      });
      setProfile(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function useMyLocation() {
    if (!navigator.geolocation) return;
    setGpsBusy(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const r = await reverseGeocode(token, pos.coords.latitude, pos.coords.longitude);
        if (r?.name) setHomeAddress(r.name);
        setGpsBusy(false);
      },
      () => setGpsBusy(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  if (loading) return <p className="history-empty">⏳ Loading profile…</p>;
  if (error && !profile) return <p className="form-error">{error}</p>;

  return (
   <>
    <div className="profile-section">
      <h2 className="estimate-title">👤 My Profile</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#e5e7eb", overflow: "hidden", flexShrink: 0 }}>
          {profile && profile.avatar_url
            ? <img src={profile.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 26 }}>👤</div>}
        </div>
        <label style={{ fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#4c82f0" }}>
          {avatarBusy ? "Uploading…" : "📷 Change photo"}
          <input type="file" accept="image/*" onChange={handleAvatar} disabled={avatarBusy} style={{ display: "none" }} />
        </label>
      </div>
      {profile && (
        <div className="profile-info">
          <span className="profile-email">✉️ {profile.email}</span>
          <span className="profile-role">{profile.role}</span>
        </div>
      )}
      <ChangeEmailBox />
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
        <label className="profile-label">
          <span>Home address</span>
          <input
            className="profile-input"
            type="text"
            placeholder="Your home address"
            value={homeAddress}
            onChange={(e) => setHomeAddress(e.target.value)}
            maxLength={255}
          />
          <button type="button" className="link-btn" onClick={useMyLocation} disabled={gpsBusy}>
            {gpsBusy ? "Locating…" : "📡 Use my current location"}
          </button>
        </label>
        {error && <p className="form-error">{error}</p>}
        {success && <p className="profile-success">✓ Profile updated</p>}
        <button type="submit" className="estimate-btn" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
    <BankAccountForm token={token} />
   </>
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

  async function handleDelete(id) {
    const prev = notifs;
    setNotifs((cur) => cur.filter((n) => n.notification_id !== id)); // optimistic
    try {
      await deleteNotification(token, id);
      onRead();
    } catch (_) {
      setNotifs(prev); // restore on failure
    }
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
              <button
                className="notif-delete-btn"
                title="Delete notification"
                onClick={() => handleDelete(n.notification_id)}
              >✕</button>
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

// ---------------------------------------------------------------------------
// Craft / Maintenance section — Sprint 48
// ---------------------------------------------------------------------------

const CRAFT_CATEGORIES = [
  "breakdown", "flat_tyre", "tow", "fuel", "lockout", "battery", "accident", "diagnostics", "other",
];
const CRAFT_CAT_LABELS = {
  breakdown:   "Breakdown",
  flat_tyre:   "Flat Tire",
  tow:         "Towing",
  fuel:        "Out of Fuel",
  lockout:     "Lockout",
  battery:     "Dead Battery",
  accident:    "Post-Accident",
  diagnostics: "Diagnostics",
  other:       "Other",
};
// Category → Icon name (see Icon.jsx). Keeps the label text-only so the same
// map renders cleanly in both the picker (icon + text) and the status chips.
const CRAFT_CAT_ICON = {
  breakdown:   "assistance",
  flat_tyre:   "tire",
  tow:         "tow",
  fuel:        "fuel",
  lockout:     "lock",
  battery:     "battery",
  accident:    "alert",
  diagnostics: "search",
  other:       "assistance",
};
const CRAFT_STATUS_LABELS = {
  open:           "Open — accepting bids",
  bidding_closed: "Bidding closed",
  assigned:       "Professional on the way",
  arrived:        "Professional has arrived",
  in_progress:    "Work in progress",
  pro_done:       "Work finished — confirm completion",
  completed:      "Completed",
  cancelled:      "Cancelled",
};
// Status → semantic color (design system: pending=slate, active=blue,
// done=green, cancelled=red). The badge is color-coded so the emoji is no
// longer needed to signal state.
const CRAFT_STATUS_COLOR = {
  open:           "active",
  bidding_closed: "pending",
  assigned:       "active",
  arrived:        "active",
  in_progress:    "active",
  pro_done:       "active",
  completed:      "ok",
  cancelled:      "crit",
};

// Customer-facing progress milestones for an assistance job. Each status maps
// to the step the customer has reached, so we can show a clear timeline of
// "where is my help right now" instead of a bare status word.
const CRAFT_TIMELINE_STEPS = ["Requested", "On the way", "Arrived", "In progress", "Completed"];
const CRAFT_STATUS_STEP = {
  open: 0, bidding_closed: 0,
  assigned: 1, arrived: 2,
  in_progress: 3, pro_done: 3,
  completed: 4,
};

function CraftStatusTimeline({ status }) {
  if (status === "cancelled") return null;
  const current = CRAFT_STATUS_STEP[status] ?? 0;
  const complete = status === "completed";
  return (
    <ol className="craft-timeline" aria-label="Request progress">
      {CRAFT_TIMELINE_STEPS.map((label, i) => {
        const done = complete || i < current;
        const active = !complete && i === current;
        const state = done ? "done" : active ? "active" : "todo";
        return (
          <li key={label} className={`craft-tl-step craft-tl-${state}`}>
            <span className="craft-tl-dot">{done ? "✓" : i + 1}</span>
            <span className="craft-tl-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Chat panel for a craft request conversation — Sprint 66 (polling 3s)
function RequestChatPanel({ token, requestId, accent = "#4c82f0" }) {
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

// Payment for a completed assistance job (reuses the trip payment infra)
function CraftPayment({ token, requestId, paid }) {
  const [intent, setIntent] = useState(null);

  // Sprint 74 — payment is automatic (held when the bid is selected, captured
  // when the pro finishes). Poll to reflect the status; no manual pay button.
  useEffect(() => {
    let active = true;
    const load = () => getCraftPayment(token, requestId).then((d) => { if (active && d) setIntent(d); }).catch(() => {});
    load();
    const iv = setInterval(load, 6000);
    return () => { active = false; clearInterval(iv); };
  }, [token, requestId]);

  if (paid || intent?.status === "paid") {
    return <p className="craft-success">✅ Payment confirmed{intent ? ` — ${formatUSD(intent.amount_cents)}` : ""}</p>;
  }
  if (intent?.status === "authorized") {
    return (
      <p className="payment-hint" style={{ color: "var(--color-muted)" }}>
        💳 Held on your card{intent ? ` (${formatUSD(intent.amount_cents)})` : ""} — charged when the professional finishes the job.
      </p>
    );
  }
  return (
    <p className="payment-hint" style={{ color: "var(--color-muted)" }}>
      💳 Charged automatically to your saved card when the professional finishes the job.
    </p>
  );
}

// Bids view for a single craft request
function CraftBidsView({ token, request: initialRequest, onBack, onNeedCard }) {
  const [request, setRequest] = useState(initialRequest);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const reloadRequest = useCallback(async () => {
    try { setRequest(await getCraftRequest(token, initialRequest.request_id)); } catch { /* keep */ }
  }, [token, initialRequest.request_id]);

  useEffect(() => {
    setLoading(true);
    getCraftRequestBids(token, request.request_id)
      .then(setBids)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, request.request_id]);

  // Poll the request status while the job is active so the right buttons show.
  useEffect(() => {
    if (["completed", "cancelled"].includes(request.status)) return;
    const id = setInterval(reloadRequest, 5000);
    return () => clearInterval(id);
  }, [request.status, reloadRequest]);

  // Live position of the assigned pro (null until they push one). Poll while the
  // pro is travelling / on site — stop once the work is under way or finished.
  const [tracking, setTracking] = useState(null);
  useEffect(() => {
    if (!["assigned", "arrived", "in_progress"].includes(request.status)) { setTracking(null); return; }
    let active = true;
    const tick = () => getCraftTracking(token, request.request_id)
      .then((t) => { if (active) setTracking(t); })
      .catch(() => {});
    tick();
    const id = setInterval(tick, 5000);
    return () => { active = false; clearInterval(id); };
  }, [token, request.request_id, request.status]);

  // Load the pro's before/after photos once a pro is assigned.
  useEffect(() => {
    if (!["assigned", "arrived", "in_progress", "pro_done", "completed"].includes(request.status)) return;
    listCraftPhotos(token, request.request_id).then(setPhotos).catch(() => {});
  }, [token, request.request_id, request.status]);

  async function handleSelect(bidId) {
    setSelecting(bidId); setError(null);
    try {
      const updated = await selectCraftBid(token, request.request_id, bidId);
      setRequest(updated);
      setSuccess("✅ Professional accepted! They are on their way.");
    } catch (e) {
      setError(e.message);
      // Sprint 74 — no saved card → send them to the Payment tab to add one.
      if (/payment card/i.test(e.message || "") && onNeedCard) onNeedCard();
    }
    finally { setSelecting(null); }
  }

  async function runAction(fn) {
    setActionBusy(true); setError(null);
    try { setRequest(await fn(token, request.request_id)); }
    catch (e) { setError(e.message); }
    finally { setActionBusy(false); }
  }

  const canSelect = ["open", "bidding_closed"].includes(request.status);
  const isActive = ["assigned", "arrived", "in_progress", "pro_done", "completed"].includes(request.status);
  const acceptedBid = bids.find((b) => b.status === "accepted") || null;

  // Short "where is my pro" line keyed off the job status — the roadside
  // north-star is time-to-help, so surface the ETA while they're en route.
  function proStatusLine() {
    switch (request.status) {
      case "assigned": {
        // Prefer the live ETA (updates as the pro drives), fall back to the bid.
        const eta = tracking?.eta_min ?? acceptedBid?.eta_min;
        return eta != null ? `🚗 On the way — ~${eta} min away` : "🚗 On the way";
      }
      case "arrived":     return "📍 On site";
      case "in_progress":
      case "pro_done":    return "🔧 Working on it";
      case "completed":   return "✅ Job done";
      default:            return null;
    }
  }

  return (
    <div className="craft-detail">
      <button className="craft-back-btn" onClick={onBack}>← Back to my requests</button>
      <div className="craft-request-info">
        <span className="craft-cat-chip">{CRAFT_CAT_LABELS[request.category] ?? request.category}</span>
        <span className="craft-status-label">{CRAFT_STATUS_LABELS[request.status] ?? request.status}</span>
      </div>
      <p className="craft-description">{request.description}</p>
      {request.address && <p className="craft-meta">📍 {request.address}</p>}

      {/* Progress timeline once a professional is assigned */}
      {isActive && <CraftStatusTimeline status={request.status} />}

      {/* Assigned-professional summary — agreed price + live "where are they" */}
      {isActive && acceptedBid && (
        <div className="craft-pro-card">
          <div className="craft-pro-head">
            <span className="craft-pro-title">Your professional</span>
            <span className="craft-pro-price">{formatUSD(acceptedBid.price_cents)}</span>
          </div>
          <span className="craft-pro-status">{proStatusLine()}</span>
        </div>
      )}

      {/* Live map — the pro moving toward the customer, while en route / on site */}
      {["assigned", "arrived", "in_progress"].includes(request.status) && (
        <CraftTrackingMap
          customerLat={request.lat}
          customerLng={request.lng}
          proLat={tracking?.pro_lat ?? null}
          proLng={tracking?.pro_lng ?? null}
        />
      )}

      {/* Shared verification code once a professional is assigned */}
      {isActive && request.verification_code && (
        <div className="verify-code-card">
          <span className="verify-code-label">🔐 Verification code</span>
          <span className="verify-code-value">{request.verification_code}</span>
          <span className="verify-code-hint">Share it with your professional on site.</span>
        </div>
      )}

      {/* Customer lifecycle actions */}
      {request.status === "arrived" && (
        <button className="board-btn" disabled={actionBusy} onClick={() => runAction(craftConfirmArrival)}>
          {actionBusy ? "Confirming…" : "✅ Confirm the professional has arrived"}
        </button>
      )}
      {request.status === "pro_done" && (
        <button className="board-btn" disabled={actionBusy} onClick={() => runAction(craftComplete)}>
          {actionBusy ? "Confirming…" : "✅ Confirm the work is finished"}
        </button>
      )}

      {/* Before/after photos from the professional (read-only) */}
      {photos.length > 0 && (
        <div className="craft-photos-ro">
          <h4 className="craft-photos-ro-title">📷 Photos from your professional</h4>
          {["before", "after"].map((k) => {
            const items = photos.filter((p) => p.kind === k);
            if (items.length === 0) return null;
            return (
              <div key={k} className="craft-photo-group">
                <span className="craft-photo-kind">{k === "before" ? "Before" : "After"}</span>
                <div className="craft-photo-thumbs">
                  {items.map((p) => p.url && (
                    <a key={p.photo_id} href={p.url} target="_blank" rel="noopener noreferrer">
                      <img src={p.url} alt={k} className="craft-photo-thumb" />
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
              <p className="craft-bid-dist">📍 {fmtMiles(b.distance_km)} mi away</p>
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
      {/* Payment once the job is completed */}
      {request.status === "completed" && (
        <CraftPayment token={token} requestId={request.request_id} paid={!!request.paid_at} />
      )}

      {(isActive || success || bids.some((b) => b.status === "accepted")) && (
        <RequestChatPanel token={token} requestId={request.request_id} accent="#4c82f0" />
      )}
    </div>
  );
}

// New craft request form
function CraftNewRequestForm({ token, onCreated, onCancel }) {
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  // Location is a single { lat, lng, name } object — set by the Mapbox address
  // autocomplete (AddressInput, same as the ride form) or by GPS.
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Resolve the browser GPS position into a { lat, lng, name } location,
  // reverse-geocoding to a readable address (falls back to coordinates).
  const useGPS = useCallback((silent) => {
    if (!navigator.geolocation) { if (!silent) setError("Geolocation not available in this browser."); return; }
    setLocating(true); if (!silent) setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        let name = `My location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
        try { const r = await reverseGeocode(token, latitude, longitude); if (r?.name) name = r.name; } catch { /* keep fallback */ }
        setLocation({ lat: latitude, lng: longitude, name });
        setLocating(false);
      },
      () => { if (!silent) setError("Couldn't get your GPS position — search your address instead."); setLocating(false); },
      { timeout: silent ? 8000 : 10000 },
    );
  }, [token]);

  // Auto-detect GPS silently on mount (the customer can override by searching).
  useEffect(() => {
    if (!location) useGPS(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!category) { setError("Please select a category."); return; }
    if (!location) { setError("Add your location — search an address or use GPS."); return; }
    setSubmitting(true); setError(null);
    try {
      const req = await createCraftRequest(token, {
        category,
        description: description.trim(),
        lat: location.lat,
        lng: location.lng,
        address: location.name?.trim() || null,
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
          <span className="craft-label">Type of issue</span>
          <div className="craft-cat-grid">
            {CRAFT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`craft-cat-btn ${category === cat ? "craft-cat-selected" : ""}`}
                onClick={() => setCategory(cat)}
              >
                <Icon name={CRAFT_CAT_ICON[cat]} size={16} /> {CRAFT_CAT_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="craft-field">
          <span className="craft-label">Describe the issue</span>
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

        {/* Address — Mapbox autocomplete (same component as the ride form),
            with the 📡 button for one-tap GPS. Selecting an address sets the
            coordinates too, so the pro knows exactly where to go. */}
        <div className="craft-field">
          <span className="craft-label">Your location</span>
          <AddressInput
            icon="📍"
            placeholder="Search your address…"
            value={location}
            onSelect={setLocation}
            token={token}
            onGps={() => useGPS(false)}
          />
          {locating && <p className="craft-gps-ok">⏳ Detecting your GPS position…</p>}
        </div>

        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="craft-submit-btn" disabled={submitting || !category || !location}>
          {submitting ? "Posting…" : "📤 Post Request"}
        </button>
      </form>
    </div>
  );
}

// Main craft section — list + new request + bids view
function CraftSection({ token, onNeedCard }) {
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
        onNeedCard={onNeedCard}
      />
    );
  }

  // List view
  return (
    <div className="craft-section">
      <div className="craft-list-header">
        <h2 className="estimate-title">🔧 Assistance</h2>
        <button className="craft-new-btn" onClick={() => setView("new")}>
          + New Request
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <p className="craft-loading">⏳ Loading…</p>}

      {!loading && requests.length === 0 && (
        <div className="craft-empty">
          <p>No assistance requests yet.</p>
          <button className="craft-submit-btn" onClick={() => setView("new")}>
            Post Your First Request
          </button>
        </div>
      )}

      <div className="craft-list">
        {requests.map((req) => {
          const deadline = req.bid_deadline ? new Date(req.bid_deadline) : null;
          const isExpired = deadline && deadline < new Date();
          // The customer can open the detail at every stage of the job (to confirm
          // arrival, see the code/photos, confirm completion, pay) — only a
          // cancelled request has nothing to show.
          const canViewBids = req.status !== "cancelled";
          const bidsStage = ["open", "bidding_closed"].includes(req.status);
          const canCancel = req.status === "open";

          return (
            <div key={req.request_id} className="craft-request-card">
              <div className="craft-request-header">
                <span className="craft-cat-chip">{CRAFT_CAT_LABELS[req.category] ?? req.category}</span>
                <span className={`craft-status-badge cs-${CRAFT_STATUS_COLOR[req.status] ?? "pending"}`}>{CRAFT_STATUS_LABELS[req.status] ?? req.status}</span>
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
                    {bidsStage ? "View Bids →" : "View Details →"}
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
  pending:  "Pending",
  approved: "Approved",
  rejected: "Rejected",
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

// Sprint 73 — saved cards for ride payments (charged when the ride completes).
function PaymentMethods({ token }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const cardElRef = useRef(null);
  const stripeRef = useRef(null);
  const elementRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    listPaymentMethods(token).then(setCards).catch(() => setCards([])).finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  // Mount the Stripe card field whenever the add-card form opens.
  useEffect(() => {
    if (!adding) return;
    const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!pk || !window.Stripe) { setErr("Card entry is unavailable right now."); return; }
    const stripe = window.Stripe(pk);
    stripeRef.current = stripe;
    const card = stripe.elements().create("card", {
      style: {
        base: {
          color: "#f8fafc",
          fontSize: "16px",
          "::placeholder": { color: "#94a3b8" },
        },
        invalid: { color: "#f87171" },
      },
    });
    card.mount(cardElRef.current);
    elementRef.current = card;
    return () => { try { card.unmount(); } catch (_) { /* noop */ } };
  }, [adding]);

  async function handleAdd(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const { client_secret } = await createSetupIntent(token);
      const result = await stripeRef.current.confirmCardSetup(client_secret, {
        payment_method: { card: elementRef.current },
      });
      if (result.error) { setErr(result.error.message); }
      else { setAdding(false); load(); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function act(fn) {
    setBusy(true); setErr(null);
    try { await fn(); load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="profile-section">
      <h2 className="estimate-title">💳 Payment methods</h2>
      <p style={{ color: "#6b7280", fontSize: 14, marginTop: -4 }}>
        Add a card to book rides. You're charged automatically when the ride completes — nothing to do at pickup.
      </p>

      {loading ? <p className="history-empty">⏳ Loading…</p> : (
        <>
          {cards.length === 0 && !adding && <p className="history-empty">No card saved yet.</p>}
          {cards.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>
                <strong style={{ textTransform: "capitalize" }}>{c.brand || "card"}</strong> •••• {c.last4}
                <span style={{ color: "#6b7280" }}> · {String(c.exp_month).padStart(2, "0")}/{c.exp_year}</span>
                {c.is_default && <span style={{ color: "#16a34a", fontWeight: 600 }}> · Default</span>}
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                {!c.is_default && (
                  <button type="button" className="link-btn" disabled={busy}
                    onClick={() => act(() => setDefaultPaymentMethod(token, c.id))}>Set default</button>
                )}
                <button type="button" className="link-btn" style={{ color: "#dc2626" }} disabled={busy}
                  onClick={() => act(() => deletePaymentMethod(token, c.id))}>Remove</button>
              </span>
            </div>
          ))}

          {adding ? (
            <form onSubmit={handleAdd} style={{ marginTop: 12 }}>
              <div ref={cardElRef} style={{ padding: 14, border: "1px solid #e5e7eb", borderRadius: 10 }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="submit" className="book-btn" disabled={busy}>{busy ? "Saving…" : "Save card"}</button>
                <button type="button" className="link-btn" disabled={busy} onClick={() => { setAdding(false); setErr(null); }}>Cancel</button>
              </div>
            </form>
          ) : (
            <button type="button" className="book-btn" style={{ marginTop: 12 }} onClick={() => { setErr(null); setAdding(true); }}>
              + Add a card
            </button>
          )}
        </>
      )}
      {err && <p className="form-error" style={{ marginTop: 10 }}>{err}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity section — Sprint 65: unified history (rides + assistance)
// ---------------------------------------------------------------------------

// Read-only list of the customer's assistance requests, used inside Activity.
function ActivityCraftList({ token, onOpen }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let alive = true;
    getMyCraftRequests(token)
      .then((d) => { if (alive) setRequests(d); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  if (loading) return <p className="craft-loading">⏳ Loading…</p>;
  if (error)   return <p className="form-error">{error}</p>;
  if (requests.length === 0) return <p className="history-empty">No assistance requests yet.</p>;

  return (
    <div className="craft-list">
      {requests.map((req) => (
        <div key={req.request_id} className="craft-request-card">
          <div className="craft-request-header">
            <span className="craft-cat-chip">{CRAFT_CAT_LABELS[req.category] ?? req.category}</span>
            <span className={`craft-status-badge cs-${CRAFT_STATUS_COLOR[req.status] ?? "pending"}`}>{CRAFT_STATUS_LABELS[req.status] ?? req.status}</span>
          </div>
          <p className="craft-request-desc">{req.description}</p>
          {req.address && <p className="craft-meta">📍 {req.address}</p>}
          <p className="craft-date">
            Posted: {new Date(req.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
          </p>
          {req.status !== "cancelled" && (
            <div className="craft-request-actions">
              <button className="craft-view-bids-btn" onClick={() => onOpen(req)}>View Details →</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ActivitySection({ token, onNeedCard }) {
  const [filter, setFilter] = useState("all"); // "all" | "rides" | "assistance"
  const [selectedRequest, setSelectedRequest] = useState(null);

  // Opening an assistance item reuses the same detail/bids view as the
  // Assistance tab, so the customer can act on it without switching tabs.
  if (selectedRequest) {
    return (
      <CraftBidsView
        token={token}
        request={selectedRequest}
        onBack={() => setSelectedRequest(null)}
        onNeedCard={onNeedCard}
      />
    );
  }

  const showRides       = filter === "all" || filter === "rides";
  const showAssistance  = filter === "all" || filter === "assistance";

  return (
    <div className="activity-section">
      <h2 className="estimate-title">📋 Activity</h2>
      <div className="activity-filter">
        <button className={`activity-chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</button>
        <button className={`activity-chip ${filter === "rides" ? "active" : ""}`} onClick={() => setFilter("rides")}>Rides</button>
        <button className={`activity-chip ${filter === "assistance" ? "active" : ""}`} onClick={() => setFilter("assistance")}>Assistance</button>
      </div>

      {showRides && (
        <div className="activity-group">
          {filter === "all" && <h3 className="activity-group-title">🚕 Rides</h3>}
          <div className="history-section"><TripHistory token={token} /></div>
        </div>
      )}
      {showAssistance && (
        <div className="activity-group">
          {filter === "all" && <h3 className="activity-group-title">🔧 Assistance</h3>}
          <ActivityCraftList token={token} onOpen={setSelectedRequest} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account section — Sprint 65: secondary items grouped under one tab
// ---------------------------------------------------------------------------

function AccountSection({ token, sub, onSub }) {
  const ITEMS = [
    { key: "profile", icon: "👤", label: "Profile" },
    { key: "cards",   icon: "💳", label: "Payment Methods" },
    { key: "docs",    icon: "📄", label: "My Documents" },
    { key: "places",  icon: "📍", label: "Saved Places" },
  ];

  if (sub) {
    return (
      <div className="account-sub">
        <button className="account-back-btn" onClick={() => onSub(null)}>← Account</button>
        {sub === "profile" && <ProfileSection token={token} />}
        {sub === "cards"   && <PaymentMethods token={token} />}
        {sub === "docs"    && <DocumentsSection token={token} />}
        {sub === "places"  && <SavedPlacesSection token={token} />}
      </div>
    );
  }

  return (
    <div className="account-section">
      <h2 className="estimate-title">👤 Account</h2>
      <div className="account-menu">
        {ITEMS.map((it) => (
          <button key={it.key} className="account-menu-row" onClick={() => onSub(it.key)}>
            <span className="account-menu-icon">{it.icon}</span>
            <span className="account-menu-label">{it.label}</span>
            <span className="account-menu-chevron">›</span>
          </button>
        ))}
        <button
          className="account-menu-row"
          onClick={() => window.open(`${DRIVER_APP_URL}?signup=1`, "_blank", "noopener")}
        >
          <span className="account-menu-icon">🧑‍✈️</span>
          <span className="account-menu-label">Become a Driver</span>
          <span className="account-menu-chevron">↗</span>
        </button>
      </div>
    </div>
  );
}

function Dashboard({ user, token, onLogout }) {
  const [activeTrip, setActiveTrip] = useState(null);
  const [mode, setMode] = useState("course"); // "course" | "assistance" | "activity" | "account" | "notifications"
  const [accountSub, setAccountSub] = useState(null); // sub-screen within Account
  const [unreadCount, setUnreadCount] = useState(0);

  // Restore any in-progress ride on load so a page reload doesn't drop the
  // customer's live tracking view. Only adopts it while nothing is active yet.
  useEffect(() => {
    let active = true;
    getActiveTrip(token)
      .then((trip) => { if (active && trip) setActiveTrip((cur) => cur ?? trip); })
      .catch(() => {});
    return () => { active = false; };
  }, [token]);

  // Deep-link used by booking / assistance flows that need a saved card:
  // jump to Account → Payment Methods.
  const goToCards = useCallback(() => { setAccountSub("cards"); setMode("account"); }, []);

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
            <Icon name="bell" size={20} />{unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
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
              className={`mode-tab ${mode === "course" ? "active" : ""}`}
              onClick={() => setMode("course")}
            >
              <Icon name="ride" /> Ride
            </button>
            <button
              className={`mode-tab ${mode === "assistance" ? "active" : ""}`}
              onClick={() => setMode("assistance")}
            >
              <Icon name="assistance" /> Assistance
            </button>
            <button
              className={`mode-tab ${mode === "activity" ? "active" : ""}`}
              onClick={() => setMode("activity")}
            >
              <Icon name="activity" /> Activity
            </button>
            <button
              className={`mode-tab ${mode === "account" ? "active" : ""}`}
              onClick={() => { setAccountSub(null); setMode("account"); }}
            >
              <Icon name="account" /> Account
            </button>
          </div>
          {mode === "course" && (
            <EstimateSection token={token} onTripCreated={setActiveTrip} onNeedCard={goToCards} />
          )}
          {mode === "assistance" && <CraftSection token={token} onNeedCard={goToCards} />}
          {mode === "activity" && <ActivitySection token={token} onNeedCard={goToCards} />}
          {mode === "account" && (
            <AccountSection token={token} sub={accountSub} onSub={setAccountSub} />
          )}
          {mode === "notifications" && (
            <NotificationsSection token={token} onRead={refreshUnread} />
          )}
        </>
      )}

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
  const [loginNotice, setLoginNotice] = useState(null);
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

  // When the backend refuses an unverified e-mail (prod gate), surface a
  // friendly "verify your e-mail" notice instead of a raw error. (Sprint 67)
  async function handleUnverified(email, { resend }) {
    if (resend) { try { await resendVerification(); } catch (_) { /* best effort */ } }
    await firebaseSignOut();
    setLoginError(null);
    setLoginNotice(`Please verify your email. We sent a link to ${email} — click it, then sign in.`);
  }

  async function handleEmailLogin(email, password) {
    setLoginLoading(true); setLoginError(null); setLoginNotice(null);
    try {
      // Firebase identity when configured; /v1/token fallback for local dev.
      const { access_token } = firebaseEnabled
        ? await exchangeFirebaseToken(await signInEmail(email, password))
        : await login(email, password);
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
    } catch (e) {
      if (e.message === "EMAIL_NOT_VERIFIED") return handleUnverified(email, { resend: true });
      setLoginError(e.message);
    }
    finally { setLoginLoading(false); }
  }

  async function handleGoogleLogin() {
    setLoginLoading(true); setLoginError(null); setLoginNotice(null);
    try {
      const idToken = await signInWithGoogle();
      const { access_token } = await exchangeFirebaseToken(idToken);
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginLoading(false); }
  }

  async function handleSignup(email, password, firstName, lastName, birthDate, phone) {
    setLoginLoading(true); setLoginError(null); setLoginNotice(null);
    try {
      const { access_token } = firebaseEnabled
        ? await exchangeFirebaseToken(await signUpEmail(email, password), { firstName, lastName, birthDate, phone })
        : await signup(email, password, firstName, lastName, birthDate, phone || null);
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
    } catch (e) {
      if (e.message === "EMAIL_NOT_VERIFIED") return handleUnverified(email, { resend: false });
      setLoginError(e.message);
    }
    finally { setLoginLoading(false); }
  }

  async function handleLogout() {
    await firebaseSignOut();
    localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null);
  }

  if (!token) return <LoginForm onEmailLogin={handleEmailLogin} onGoogleLogin={handleGoogleLogin} onSignup={handleSignup} error={loginError} notice={loginNotice} loading={loginLoading} />;
  if (!user)  return <div className="app"><div className="status loading">⏳ Loading…</div></div>;
  if (user.role !== REQUIRED_ROLE) return <AccessDenied role={user.role} onLogout={handleLogout} />;
  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}
