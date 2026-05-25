import { useEffect, useState, useCallback } from "react";
import {
  login, fetchMe, fetchDemo, registerUser, fetchEstimate, createTrip, getTrip, cancelTrip, rateTrip,
  createAssistanceRequest, getAssistanceRequest, cancelAssistanceRequest, listMyAssistance, listMyTrips,
  validatePromo,
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
      <p className="subtitle">Sprint 8 — Notation du trajet</p>
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (origin === dest) { setError("Choisissez deux points différents."); return; }
    setLoading(true); setError(null); setResult(null); setPromoApplied(null); setPromoInput("");
    try {
      const o = ABIDJAN_LOCATIONS[origin];
      const d = ABIDJAN_LOCATIONS[dest];
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
      const trip = await createTrip(token, result.estimate_id, promoApplied?.code ?? null);
      onTripCreated(trip);
    } catch (err) { setError(err.message); }
    finally { setBooking(false); }
  }

  // Compute displayed fare (with or without promo)
  const displayFare = promoApplied && result
    ? Math.max(1, Math.round(result.fare_xof * (1 - promoApplied.discount_pct / 100)))
    : result?.fare_xof;

  return (
    <div className="estimate-section">
      <h2 className="estimate-title">Estimer mon trajet</h2>
      <form className="estimate-form" onSubmit={handleSubmit}>
        <div className="estimate-row">
          <label>
            <span className="estimate-label">📍 Départ</span>
            <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
              {LOCATION_NAMES.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label>
            <span className="estimate-label">🏁 Arrivée</span>
            <select value={dest} onChange={(e) => setDest(e.target.value)}>
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
              <span className="fare-original">{formatXOF(result.fare_xof)}</span>
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
// Booking status card — shows trip state + cancel + 5-second polling
// ---------------------------------------------------------------------------

function BookingSection({ token, trip, onTripUpdate, onNewEstimate }) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(null);

  // Poll every 5 s until the trip reaches a terminal state
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
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ user, token, onLogout }) {
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeAssistance, setActiveAssistance] = useState(null);
  const [mode, setMode] = useState("ride"); // "ride" | "assistance" | "history" | "trips"

  // Derive which main section to show
  const showBooking    = activeTrip && !TERMINAL_STATUSES.has(activeTrip.status);
  const showAssistCard = !showBooking && activeAssistance && !ASSISTANCE_TERMINAL.has(activeAssistance.status);
  const showTabs       = !showBooking && !showAssistCard;

  return (
    <div className="app">
      <header className="dash-header">
        <h1>Ziza Customer</h1>
        <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
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
        </>
      )}

      <p className="footer">App: <strong>web-customer</strong> · Sprint 13</p>
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
