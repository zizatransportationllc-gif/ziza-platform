import { useEffect, useState } from "react";
import { login, fetchMe, fetchDemo, registerUser, fetchEstimate, createTrip, getTrip, cancelTrip } from "./api";
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
      <p className="subtitle">Sprint 6 — Réservation de trajet</p>
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (origin === dest) { setError("Choisissez deux points différents."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const o = ABIDJAN_LOCATIONS[origin];
      const d = ABIDJAN_LOCATIONS[dest];
      const data = await fetchEstimate(token, o.lat, o.lng, d.lat, d.lng);
      setResult(data);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleBook() {
    setBooking(true); setError(null);
    try {
      const trip = await createTrip(token, result.estimate_id);
      onTripCreated(trip);
    } catch (err) { setError(err.message); }
    finally { setBooking(false); }
  }

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
          <div className="fare-amount">{formatXOF(result.fare_xof)}</div>
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
          <button className="book-btn" onClick={handleBook} disabled={booking}>
            {booking ? "Réservation…" : "🚕 Réserver ce trajet"}
          </button>
        </div>
      )}
    </div>
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
      </div>
      {error && <p className="form-error">{error}</p>}
      {canCancel && (
        <button className="cancel-btn" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? "Annulation…" : "Annuler le trajet"}
        </button>
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
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ user, token, onLogout }) {
  const [activeTrip, setActiveTrip] = useState(null);

  return (
    <div className="app">
      <header className="dash-header">
        <h1>Ziza Customer</h1>
        <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
      </header>
      <div className="status ok">✓ Connecté — <strong>{user.email}</strong></div>
      <div className="role-badge">{user.role} · {user.provider}</div>

      {activeTrip ? (
        <BookingSection
          token={token}
          trip={activeTrip}
          onTripUpdate={setActiveTrip}
          onNewEstimate={() => setActiveTrip(null)}
        />
      ) : (
        <EstimateSection token={token} onTripCreated={setActiveTrip} />
      )}

      <p className="footer">App: <strong>web-customer</strong> · Sprint 6</p>
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
