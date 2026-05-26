import { useEffect, useState, useCallback } from "react";
import {
  login, fetchMe, fetchDemo, registerUser, fetchEstimate, createTrip, getTrip, cancelTrip, rateTrip,
  createAssistanceRequest, getAssistanceRequest, cancelAssistanceRequest, listMyAssistance, listMyTrips,
  validatePromo, getProfile, updateProfile,
  listNotifications, getUnreadCount, markAllRead,
  listPlaces, createPlace, updatePlace, deletePlace,
  listCategories, getTripEta, getTripTracking,
  createPaymentIntent, getTripPayment, simulatePayment,
} from "./api";
import { firebaseEnabled, signInWithGoogle, firebaseSignOut } from "./auth";

const REQUIRED_ROLE = "customer";
const TOKEN_KEY = "ziza_token";

// Predefined Abidjan landmarks for the estimate form
const ABIDJAN_LOCATIONS = {
  "Plateau (Centre-ville)": { lat: 5.3207, lng: -4.0175 },
  "Cocody":                 { lat: 5.3600, lng: -3.9801 },
  "Yopougon":               { lat: 5.3386, lng: -4.0721 },
  "Abobo":                  { lat: 5.4154, lng: -4.0243 },
  "Marcory":                { lat: 5.2997, lng: -3.9904 },
  "Treichville":            { lat: 5.2975, lng: -4.0119 },
  "Adjamé":                 { lat: 5.3612, lng: -4.0288 },
  "Aéroport (Port-Bouët)":  { lat: 5.2537, lng: -3.9268 },
};

const LOCATION_NAMES = Object.keys(ABIDJAN_LOCATIONS);

// Sprint 20 — saved places constants
const PLACE_LABEL_ICONS = { home: "🏠", work: "💼", other: "📍" };
const PLACE_LABEL_NAMES = { home: "Domicile", work: "Travail", other: "Autre" };

// Sprint 21 — vehicle category constants
const CATEGORY_ICONS  = { economy: "🚗", comfort: "🚙", premium: "🏎️" };
const CATEGORY_ORDER  = ["economy", "comfort", "premium"];

const STATUS_LABELS = {
  pending:     "⏳ En attente d'un chauffeur",
  accepted:    "✓ Chauffeur en route",
  in_progress: "🚗 En cours",
  completed:   "✅ Trajet terminé",
  cancelled:   "✗ Trajet annulé",
};

const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

const ASSISTANCE_TYPES = [
  { value: "breakdown", label: "🔧 Panne mécanique" },
  { value: "flat_tyre", label: "🔴 Pneu crevé" },
  { value: "tow",       label: "🚛 Remorquage" },
  { value: "fuel",      label: "⛽ Manque de carburant" },
  { value: "lockout",   label: "🔑 Clés à l'intérieur" },
];

const ASSISTANCE_STATUS_LABELS = {
  pending:     "⏳ En attente d'un technicien",
  accepted:    "✓ Technicien en route",
  in_progress: "🔧 Intervention en cours",
  resolved:    "✅ Problème résolu",
  cancelled:   "✗ Demande annulée",
};

const ASSISTANCE_TERMINAL = new Set(["resolved", "cancelled"]);

function formatXOF(n) {
  return new Intl.NumberFormat("fr-FR").format(n) + " XOF";
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({ onEmailLogin, onGoogleLogin, error, loading }) {
  const [email, setEmail] = useState("customer@ziza.dev");
  const [password, setPassword] = useState("ziza2024");
  return (
    <div className="app">
      <h1>Ziza Customer</h1>
      <p className="subtitle">Sprint 24 — Paiement client</p>
      <form className="login-form" onSubmit={(e) => { e.preventDefault(); onEmailLogin(email, password); }}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" required />
        <button type="submit" disabled={loading}>{loading ? "Connexion…" : "Se connecter"}</button>
      </form>
      {firebaseEnabled && (
        <button className="google-btn" onClick={onGoogleLogin} disabled={loading}>
          <span>G</span> Continuer avec Google
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
      <p className="hint">Dev: customer@ziza.dev / ziza2024</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estimate form + fare card + "Book" button
// ---------------------------------------------------------------------------

function EstimateSection({ token, onTripCreated }) {
  const [origin, setOrigin] = useState(LOCATION_NAMES[0]);
  const [dest, setDest]     = useState(LOCATION_NAMES[1]);
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
  const [customOrigin, setCustomOrigin] = useState(null); // { name, lat, lng } | null
  const [customDest, setCustomDest]     = useState(null);
  const [showPlacePicker, setShowPlacePicker] = useState(false);
  // Sprint 21: vehicle category
  const [selectedCategory, setSelectedCategory] = useState("economy");

  useEffect(() => {
    listPlaces(token).then(setSavedPlaces).catch(() => {});
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    const o = customOrigin ?? ABIDJAN_LOCATIONS[origin];
    const d = customDest   ?? ABIDJAN_LOCATIONS[dest];
    if (o.lat === d.lat && o.lng === d.lng) { setError("Choisissez deux points différents."); return; }
    setLoading(true); setError(null); setResult(null); setPromoApplied(null); setPromoInput(""); setSelectedCategory("economy");
    try {
      const data = await fetchEstimate(token, o.lat, o.lng, d.lat, d.lng);
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
      <h2 className="estimate-title">Estimer mon trajet</h2>

      {/* Sprint 20: saved-places quick-pick */}
      {savedPlaces.length > 0 && (
        <div className="place-picker-bar">
          <button
            type="button"
            className="place-picker-toggle"
            onClick={() => setShowPlacePicker((v) => !v)}
          >
            📍 Mes lieux enregistrés {showPlacePicker ? "▲" : "▼"}
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
                    className={`place-picker-btn ${customOrigin?.place_id === p.place_id ? "active" : ""}`}
                    onClick={() => { setCustomOrigin({ ...p }); setShowPlacePicker(false); }}
                  >
                    Départ
                  </button>
                  <button
                    type="button"
                    className={`place-picker-btn ${customDest?.place_id === p.place_id ? "active" : ""}`}
                    onClick={() => { setCustomDest({ ...p }); setShowPlacePicker(false); }}
                  >
                    Arrivée
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Active custom-place chips */}
          <div className="place-chips">
            {customOrigin && (
              <span className="place-chip">
                📍 Départ : <strong>{customOrigin.name}</strong>
                <button className="place-chip-clear" onClick={() => setCustomOrigin(null)}>✕</button>
              </span>
            )}
            {customDest && (
              <span className="place-chip">
                🏁 Arrivée : <strong>{customDest.name}</strong>
                <button className="place-chip-clear" onClick={() => setCustomDest(null)}>✕</button>
              </span>
            )}
          </div>
        </div>
      )}

      <form className="estimate-form" onSubmit={handleSubmit}>
        <div className="estimate-row">
          <label>
            <span className="estimate-label">📍 Départ</span>
            <select
              value={origin}
              onChange={(e) => { setOrigin(e.target.value); setCustomOrigin(null); }}
              disabled={!!customOrigin}
              style={customOrigin ? { opacity: 0.4 } : {}}
            >
              {LOCATION_NAMES.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label>
            <span className="estimate-label">🏁 Arrivée</span>
            <select
              value={dest}
              onChange={(e) => { setDest(e.target.value); setCustomDest(null); }}
              disabled={!!customDest}
              style={customDest ? { opacity: 0.4 } : {}}
            >
              {LOCATION_NAMES.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <button type="submit" className="estimate-btn" disabled={loading || booking}>
          {loading ? "Calcul en cours…" : "Obtenir une estimation"}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {result && (
        <div className="fare-card">
          {promoApplied && (
            <div className="promo-applied-badge">
              🏷️ Code <strong>{promoApplied.code}</strong> — {promoApplied.discount_pct}% de réduction
            </div>
          )}
          <div className="fare-amount">
            {promoApplied && (
              <span className="fare-original">{formatXOF(baseFare)}</span>
            )}
            {formatXOF(displayFare)}
          </div>
          <div className="fare-meta">
            <span>🛣️ {result.distance_km.toFixed(1)} km</span>
            <span>⏱️ ~{result.duration_min} min</span>
            {result.surge_multiplier > 1 && (
              <span className="surge">🔥 ×{result.surge_multiplier} surge</span>
            )}
          </div>
          <div className="fare-source">
            {result.distance_source === "google_maps" ? "🗺️ Google Maps" : "📐 Distance estimée"}
          </div>

          {/* Sprint 21: category picker */}
          {result.categories && (
            <div className="category-picker">
              <div className="category-picker-label">Choisissez votre catégorie</div>
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
                      <span className="category-card-fare">{formatXOF(opt.fare_xof)}</span>
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
                placeholder="Code promo (optionnel)"
                value={promoInput}
                onChange={(e) => { setPromoInput(e.target.value); setPromoError(null); }}
                maxLength={32}
              />
              <button type="submit" className="promo-btn" disabled={promoValidating || !promoInput.trim()}>
                {promoValidating ? "…" : "Valider"}
              </button>
            </form>
          )}
          {promoApplied && (
            <button
              className="promo-remove-btn"
              onClick={() => { setPromoApplied(null); setPromoInput(""); }}
            >
              ✕ Retirer le code
            </button>
          )}
          {promoError && <p className="promo-error">{promoError}</p>}
          <button className="book-btn" onClick={handleBook} disabled={booking}>
            {booking ? "Réservation…" : "🚕 Réserver ce trajet"}
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
    if (stars === 0) { setError("Veuillez choisir une note."); return; }
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
        <p>Merci pour votre avis&nbsp;!</p>
      </div>
    );
  }

  return (
    <form className="rating-form" onSubmit={handleSubmit}>
      <h3 className="rating-title">Évaluer votre chauffeur</h3>
      <div className="star-picker">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star ${n <= (hover || stars) ? "filled" : ""}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setStars(n)}
            aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="rating-comment"
        placeholder="Commentaire (optionnel)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        maxLength={500}
      />
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="estimate-btn" disabled={loading || stars === 0}>
        {loading ? "Envoi…" : "Envoyer"}
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
            <div className="payment-status-paid">Payé</div>
            <div className="payment-amount">{formatXOF(intent.amount_xof)}</div>
          </div>
        </div>
      </div>
    );
  }

  if (intent && intent.status === "pending") {
    const isMock = intent.checkout_url && intent.checkout_url.includes("localhost");
    return (
      <div className="payment-section">
        <div className="payment-card">
          <span className="payment-icon">💳</span>
          <div className="payment-info">
            <div className="payment-label">Paiement en attente</div>
            <div className="payment-amount">{formatXOF(intent.amount_xof)}</div>
          </div>
        </div>
        {isMock && (
          <button
            className="payment-btn payment-btn-simulate"
            onClick={handleSimulate}
            disabled={simulating}
          >
            {simulating ? "Simulation…" : "🧪 Simuler le paiement (dev)"}
          </button>
        )}
        {!isMock && intent.checkout_url && (
          <a
            className="payment-btn"
            href={intent.checkout_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Payer sur {intent.provider}
          </a>
        )}
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
        {loading ? "Initialisation…" : `💳 Payer ${formatXOF(fareXof || 0)}`}
      </button>
      {error && <p className="form-error">{error}</p>}
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
      <h2 className="estimate-title">Mon trajet</h2>
      <div className={`booking-card booking-${trip.status}`}>
        <div className="booking-status">
          {STATUS_LABELS[trip.status] ?? trip.status}
        </div>
        {trip.fare_xof && (
          <div className="booking-fare">{formatXOF(trip.fare_xof)}</div>
        )}
        <div className="fare-meta">
          {trip.distance_km != null && <span>🛣️ {trip.distance_km.toFixed(1)} km</span>}
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
              <span className="eta-dist">{eta.distance_km.toFixed(1)} km</span>
            </div>
            <span className="eta-label">
              {trip.status === "accepted" ? "avant la prise en charge" : "avant l'arrivée"}
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
                <div className="tracking-eta">ETA : ~{driverLocation.eta_min} min</div>
              )}
              {driverLocation.updated_at && (
                <div className="tracking-updated">
                  Mis à jour : {new Date(driverLocation.updated_at).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        )}
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
      {error && <p className="form-error">{error}</p>}
      {canCancel && (
        <button className="cancel-btn" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? "Annulation…" : "Annuler le trajet"}
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
          Nouvelle estimation
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistance request form
// ---------------------------------------------------------------------------

function AssistanceSection({ token, onRequestCreated }) {
  const [type, setType] = useState(ASSISTANCE_TYPES[0].value);
  const [location, setLocation] = useState(LOCATION_NAMES[0]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const coords = ABIDJAN_LOCATIONS[location];
      const req = await createAssistanceRequest(token, type, coords.lat, coords.lng, note || undefined);
      onRequestCreated(req);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="assistance-section">
      <h2 className="estimate-title">🆘 Demande d'assistance</h2>
      <form className="assistance-form" onSubmit={handleSubmit}>
        <div className="assistance-field">
          <span className="estimate-label">Type de problème</span>
          <div className="type-grid">
            {ASSISTANCE_TYPES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`type-btn ${type === value ? "selected" : ""}`}
                onClick={() => setType(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="assistance-field">
          <span className="estimate-label">📍 Ma position</span>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="assistance-select"
          >
            {LOCATION_NAMES.map((n) => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div className="assistance-field">
          <span className="estimate-label">Note (optionnel)</span>
          <textarea
            className="assistance-note"
            placeholder="Décrivez votre problème…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="estimate-btn" disabled={loading}>
          {loading ? "Envoi…" : "🆘 Demander de l'aide"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistance status card — shown while request is active
// ---------------------------------------------------------------------------

function AssistanceStatusCard({ token, request, onRequestUpdate, onNewRequest }) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);

  // Poll every 5 s until terminal status
  useEffect(() => {
    if (ASSISTANCE_TERMINAL.has(request.status)) return;
    const id = setInterval(async () => {
      try {
        const updated = await getAssistanceRequest(token, request.request_id);
        onRequestUpdate(updated);
      } catch (_) { /* swallow */ }
    }, 5000);
    return () => clearInterval(id);
  }, [request.request_id, request.status]);

  async function handleCancel() {
    setCancelling(true); setError(null);
    try {
      const updated = await cancelAssistanceRequest(token, request.request_id);
      onRequestUpdate(updated);
    } catch (err) { setError(err.message); }
    finally { setCancelling(false); }
  }

  const typeLabel = ASSISTANCE_TYPES.find((t) => t.value === request.type)?.label ?? request.type;

  return (
    <div className="assistance-status-section">
      <h2 className="estimate-title">🆘 Mon assistance</h2>
      <div className={`assistance-card assistance-${request.status}`}>
        <div className="assistance-type-badge">{typeLabel}</div>
        <div className="assistance-status-label">
          {ASSISTANCE_STATUS_LABELS[request.status] ?? request.status}
        </div>
        {request.note && <p className="assistance-note-display">{request.note}</p>}
      </div>
      {error && <p className="form-error">{error}</p>}
      {request.status === "pending" && (
        <button className="cancel-btn" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? "Annulation…" : "Annuler la demande"}
        </button>
      )}
      {ASSISTANCE_TERMINAL.has(request.status) && (
        <button
          className="estimate-btn"
          onClick={onNewRequest}
          style={{ marginTop: "var(--space-4)" }}
        >
          Nouvelle demande
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trip history — Sprint 13
// ---------------------------------------------------------------------------

const TRIP_PAGE = 10;

function TripHistory({ token }) {
  const [trips, setTrips] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  if (loading && trips.length === 0) return <p className="history-empty">⏳ Chargement…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (trips.length === 0) return <p className="history-empty">Aucun trajet effectué pour le moment.</p>;

  return (
    <>
      <div className="history-list">
        {trips.map((t) => (
          <div key={t.trip_id} className={`history-item history-item-${t.status}`}>
            <div className="history-type">{STATUS_LABELS[t.status] ?? t.status}</div>
            {t.fare_xof && (
              <div className="history-fare">{formatXOF(t.fare_xof)}</div>
            )}
            <div className="history-meta">
              {t.distance_km != null && <span>🛣️ {t.distance_km.toFixed(1)} km</span>}
              {t.duration_min != null && <span>⏱️ {t.duration_min} min</span>}
            </div>
            <div className="history-date">
              {new Date(t.created_at).toLocaleDateString("fr-FR", {
                day: "2-digit", month: "short", year: "numeric",
              })}
            </div>
          </div>
        ))}
      </div>
      {(trips.length === TRIP_PAGE || page > 0) && (
        <div className="trip-history-pagination">
          <button className="page-btn-sm" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Précédent</button>
          <span className="page-info-sm">Page {page + 1}</span>
          <button className="page-btn-sm" onClick={() => load(page + 1)} disabled={trips.length < TRIP_PAGE || loading}>Suivant →</button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Assistance history — Sprint 12
// ---------------------------------------------------------------------------

function AssistanceHistory({ token }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listMyAssistance(token)
      .then(setHistory)
      .catch((err) => setError(err.message));
  }, [token]);

  if (error) return <p className="form-error">{error}</p>;
  if (history === null) return <p className="history-empty">⏳ Chargement…</p>;
  if (history.length === 0) return <p className="history-empty">Aucune demande d'assistance pour le moment.</p>;

  return (
    <div className="history-list">
      {history.map((req) => {
        const typeLabel = ASSISTANCE_TYPES.find((t) => t.value === req.type)?.label ?? req.type;
        return (
          <div key={req.request_id} className={`history-item history-item-${req.status}`}>
            <div className="history-type">{typeLabel}</div>
            <div className="history-status">{ASSISTANCE_STATUS_LABELS[req.status] ?? req.status}</div>
            {req.note && <div className="history-note">{req.note}</div>}
            <div className="history-date">
              {new Date(req.created_at).toLocaleDateString("fr-FR", {
                day: "2-digit", month: "short", year: "numeric",
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile section — Sprint 16
// ---------------------------------------------------------------------------

function ProfileSection({ token }) {
  const [profile, setProfile] = useState(null);
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
      const updated = await updateProfile(token, name || null, phone || null);
      setProfile(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="history-empty">⏳ Chargement du profil…</p>;
  if (error && !profile) return <p className="form-error">{error}</p>;

  return (
    <div className="profile-section">
      <h2 className="estimate-title">👤 Mon profil</h2>
      {profile && (
        <div className="profile-info">
          <span className="profile-email">✉️ {profile.email}</span>
          <span className="profile-role">{profile.role}</span>
        </div>
      )}
      <form className="profile-form" onSubmit={handleSave}>
        <label className="profile-label">
          <span>Nom d'affichage</span>
          <input
            className="profile-input"
            type="text"
            placeholder="Votre nom (optionnel)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={128}
          />
        </label>
        <label className="profile-label">
          <span>Téléphone</span>
          <input
            className="profile-input"
            type="tel"
            placeholder="+225 07 00 00 00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={32}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        {success && <p className="profile-success">✓ Profil mis à jour</p>}
        <button type="submit" className="estimate-btn" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
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
            {marking ? "…" : `Tout marquer lu (${unreadCount})`}
          </button>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && <p className="history-empty">⏳ Chargement…</p>}
      {!loading && notifs.length === 0 && (
        <p className="history-empty">Aucune notification pour le moment.</p>
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
              {new Date(n.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </div>
        ))}
      </div>
      {(notifs.length === NOTIF_PAGE || page > 0) && (
        <div className="trip-history-pagination">
          <button className="page-btn-sm" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Précédent</button>
          <span className="page-info-sm">Page {page + 1}</span>
          <button className="page-btn-sm" onClick={() => load(page + 1)} disabled={notifs.length < NOTIF_PAGE || loading}>Suivant →</button>
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
  const [formLat, setFormLat] = useState("5.3207");
  const [formLng, setFormLng] = useState("-4.0175");
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
    const c = ABIDJAN_LOCATIONS[name];
    setFormLat(String(c.lat));
    setFormLng(String(c.lng));
  }

  function openNew() {
    setEditingId(null);
    setFormLabel("home");
    setFormName("");
    setFormLandmark(LOCATION_NAMES[0]);
    setFormLat("5.3207");
    setFormLng("-4.0175");
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
    if (isNaN(lat) || isNaN(lng)) { setFormError("Coordonnées invalides."); return; }
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
        <h2 className="estimate-title">📍 Mes lieux</h2>
        {!showForm && places.length < 10 && (
          <button className="places-add-btn" onClick={openNew}>✚ Ajouter</button>
        )}
      </div>

      {error && <p className="form-error">{error}</p>}

      {showForm && (
        <form className="place-form" onSubmit={handleSave}>
          <h3 className="place-form-title">
            {editingId ? "✎ Modifier le lieu" : "✚ Nouveau lieu"}
          </h3>
          <div className="place-form-row">
            <label className="place-form-label">Type</label>
            <select className="place-form-select" value={formLabel} onChange={(e) => setFormLabel(e.target.value)}>
              <option value="home">🏠 Domicile</option>
              <option value="work">💼 Travail</option>
              <option value="other">📍 Autre</option>
            </select>
          </div>
          <div className="place-form-row">
            <label className="place-form-label">Nom</label>
            <input
              className="place-form-input"
              type="text"
              placeholder="Ex: Appartement Cocody, Bureau Plateau…"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required maxLength={256}
            />
          </div>
          <div className="place-form-row">
            <label className="place-form-label">Quartier</label>
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
              {saving ? "…" : (editingId ? "✓ Mettre à jour" : "✚ Enregistrer")}
            </button>
            <button type="button" className="place-cancel-btn" onClick={cancelForm} disabled={saving}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {loading && <p className="history-empty">⏳ Chargement…</p>}
      {!loading && places.length === 0 && !showForm && (
        <p className="history-empty">
          Aucun lieu enregistré. Cliquez sur <strong>✚ Ajouter</strong> pour sauvegarder vos adresses fréquentes.
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
              <button className="place-edit-btn" onClick={() => openEdit(p)} title="Modifier">✎</button>
              <button className="place-delete-btn" onClick={() => handleDelete(p.place_id)} title="Supprimer">🗑</button>
            </div>
          </div>
        ))}
      </div>

      {places.length >= 10 && !showForm && (
        <p className="place-limit-hint">Limite de 10 lieux atteinte.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ user, token, onLogout }) {
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeAssistance, setActiveAssistance] = useState(null);
  const [mode, setMode] = useState("ride"); // "ride" | "assistance" | "trips" | "history" | "notifications" | "profile" | "places"
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(() => {
    getUnreadCount(token).then((d) => setUnreadCount(d.count)).catch(() => {});
  }, [token]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);
  useEffect(() => { refreshUnread(); }, [mode, refreshUnread]);

  // Derive which main section to show
  const showBooking    = activeTrip && !TERMINAL_STATUSES.has(activeTrip.status);
  const showAssistCard = !showBooking && activeAssistance && !ASSISTANCE_TERMINAL.has(activeAssistance.status);
  const showTabs       = !showBooking && !showAssistCard;

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
          <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
        </div>
      </header>
      <div className="status ok">✓ Connecté — <strong>{user.email}</strong></div>
      <div className="role-badge">{user.role} · {user.provider}</div>

      {showBooking && (
        <BookingSection
          token={token}
          trip={activeTrip}
          onTripUpdate={setActiveTrip}
          onNewEstimate={() => setActiveTrip(null)}
        />
      )}

      {showAssistCard && (
        <AssistanceStatusCard
          token={token}
          request={activeAssistance}
          onRequestUpdate={setActiveAssistance}
          onNewRequest={() => setActiveAssistance(null)}
        />
      )}

      {showTabs && (
        <>
          <div className="mode-tabs">
            <button
              className={`mode-tab ${mode === "ride" ? "active" : ""}`}
              onClick={() => setMode("ride")}
            >
              🚕 Trajet
            </button>
            <button
              className={`mode-tab ${mode === "assistance" ? "active" : ""}`}
              onClick={() => setMode("assistance")}
            >
              🆘 Assistance
            </button>
            <button
              className={`mode-tab ${mode === "trips" ? "active" : ""}`}
              onClick={() => setMode("trips")}
            >
              📜 Mes trajets
            </button>
            <button
              className={`mode-tab ${mode === "history" ? "active" : ""}`}
              onClick={() => setMode("history")}
            >
              📋 Historique
            </button>
            <button
              className={`mode-tab ${mode === "profile" ? "active" : ""}`}
              onClick={() => setMode("profile")}
            >
              👤 Profil
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
              📍 Lieux
            </button>
          </div>
          {mode === "ride" && (
            <EstimateSection token={token} onTripCreated={setActiveTrip} />
          )}
          {mode === "assistance" && (
            <AssistanceSection token={token} onRequestCreated={setActiveAssistance} />
          )}
          {mode === "trips" && (
            <div className="history-section">
              <h2 className="estimate-title">Mes trajets</h2>
              <TripHistory token={token} />
            </div>
          )}
          {mode === "history" && (
            <div className="history-section">
              <h2 className="estimate-title">Mes demandes d'assistance</h2>
              <AssistanceHistory token={token} />
            </div>
          )}
          {mode === "profile" && <ProfileSection token={token} />}
          {mode === "notifications" && (
            <NotificationsSection token={token} onRead={refreshUnread} />
          )}
          {mode === "places" && <SavedPlacesSection token={token} />}
        </>
      )}

      <p className="footer">App: <strong>web-customer</strong> · Sprint 22</p>
    </div>
  );
}

function AccessDenied({ role, onLogout }) {
  return (
    <div className="app">
      <h1>Ziza Customer</h1>
      <div className="status error">✗ Accès refusé — rôle attendu : {REQUIRED_ROLE} · vous avez : {role}</div>
      <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
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

  async function handleEmailLogin(email, password) {
    setLoginLoading(true); setLoginError(null);
    try {
      const { access_token } = await login(email, password);
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginLoading(false); }
  }

  async function handleGoogleLogin() {
    setLoginLoading(true); setLoginError(null);
    try {
      const idToken = await signInWithGoogle();
      localStorage.setItem(TOKEN_KEY, idToken);
      setToken(idToken);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginLoading(false); }
  }

  async function handleLogout() {
    await firebaseSignOut();
    localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null);
  }

  if (!token) return <LoginForm onEmailLogin={handleEmailLogin} onGoogleLogin={handleGoogleLogin} error={loginError} loading={loginLoading} />;
  if (!user)  return <div className="app"><div className="status loading">⏳ Chargement…</div></div>;
  if (user.role !== REQUIRED_ROLE) return <AccessDenied role={user.role} onLogout={handleLogout} />;
  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}
