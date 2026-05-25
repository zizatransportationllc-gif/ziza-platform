import { useEffect, useState, useCallback } from "react";
import {
  login, fetchMe, registerUser, registerDriver,
  listAvailableTrips, getActiveTrip,
  acceptTrip, startTrip, completeTrip,
  listAvailableAssistance, getActiveAssistance,
  acceptAssistance, startAssistance, resolveAssistance,
  getMyRating, getMyEarnings,
} from "./api";
import { firebaseEnabled, signInWithGoogle, firebaseSignOut } from "./auth";

const REQUIRED_ROLE = "driver";
const TOKEN_KEY = "ziza_token";
const POLL_MS = 5000;

const STATUS_LABELS = {
  accepted:    "✓ Course acceptée — en route vers le client",
  in_progress: "🚗 Course en cours",
  completed:   "✅ Course terminée",
  cancelled:   "✗ Course annulée par le client",
};

const ASSISTANCE_TYPE_LABELS = {
  breakdown: "🔧 Panne mécanique",
  flat_tyre: "🔴 Pneu crevé",
  tow:       "🚛 Remorquage",
  fuel:      "⛽ Carburant",
  lockout:   "🔑 Clés perdues",
};

const ASSISTANCE_STATUS_LABELS = {
  accepted:    "✓ Intervention acceptée — en route",
  in_progress: "🔧 Intervention en cours",
  resolved:    "✅ Intervention terminée",
  cancelled:   "✗ Annulée par le client",
};

function formatXOF(n) {
  return new Intl.NumberFormat("fr-FR").format(n) + " XOF";
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({ onEmailLogin, onGoogleLogin, error, loading }) {
  const [email, setEmail] = useState("driver@ziza.dev");
  const [password, setPassword] = useState("ziza2024");
  return (
    <div className="app">
      <h1>Ziza Driver</h1>
      <p className="subtitle">Sprint 11 — Gains & statistiques</p>
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
      <p className="hint">Dev: driver@ziza.dev / ziza2024</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active trip card — shown when driver has an ongoing ride
// ---------------------------------------------------------------------------

function ActiveTripCard({ token, trip, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleAction(fn) {
    setBusy(true); setError(null);
    try { const updated = await fn(token, trip.trip_id); onUpdate(updated); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className={`active-trip-card active-${trip.status}`}>
      <div className="active-status">{STATUS_LABELS[trip.status] ?? trip.status}</div>
      {trip.fare_xof && <div className="active-fare">{formatXOF(trip.fare_xof)}</div>}
      <div className="fare-meta">
        {trip.distance_km != null && <span>🛣️ {trip.distance_km.toFixed(1)} km</span>}
        {trip.duration_min != null && <span>⏱️ ~{trip.duration_min} min</span>}
      </div>
      {error && <p className="form-error">{error}</p>}
      {trip.status === "accepted" && (
        <button className="action-btn start-btn" onClick={() => handleAction(startTrip)} disabled={busy}>
          {busy ? "…" : "🚦 Démarrer la course"}
        </button>
      )}
      {trip.status === "in_progress" && (
        <button className="action-btn complete-btn" onClick={() => handleAction(completeTrip)} disabled={busy}>
          {busy ? "…" : "🏁 Terminer la course"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Driver rating stats card
// ---------------------------------------------------------------------------

function RatingStats({ stats }) {
  if (!stats) return null;
  const { average_stars, total_ratings } = stats;

  function renderStars(avg) {
    if (avg === null) return null;
    return [1, 2, 3, 4, 5].map((n) => (
      <span key={n} className={`stat-star ${n <= Math.round(avg) ? "filled" : ""}`}>★</span>
    ));
  }

  return (
    <div className="rating-stats-card">
      <div className="rating-stats-label">Ma note</div>
      {total_ratings === 0 ? (
        <div className="rating-stats-empty">Aucune évaluation pour l'instant</div>
      ) : (
        <>
          <div className="rating-stars-row">{renderStars(average_stars)}</div>
          <div className="rating-avg">
            {average_stars !== null ? average_stars.toFixed(1) : "—"}
            <span className="rating-count"> / 5 · {total_ratings} avis</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Earnings card — Sprint 11
// ---------------------------------------------------------------------------

function EarningsCard({ earnings }) {
  if (!earnings) return null;
  const { total_xof, total_trips, today_xof, today_trips, week_xof, week_trips } = earnings;

  return (
    <div className="earnings-card">
      <div className="earnings-label">Mes gains</div>
      <div className="earnings-total">{formatXOF(total_xof)}</div>
      <div className="earnings-count">{total_trips} course{total_trips !== 1 ? "s" : ""} complétée{total_trips !== 1 ? "s" : ""}</div>
      <div className="earnings-periods">
        <div className="earnings-period">
          <span className="period-label">Aujourd'hui</span>
          <span className="period-value">{formatXOF(today_xof)}</span>
          <span className="period-trips">{today_trips} course{today_trips !== 1 ? "s" : ""}</span>
        </div>
        <div className="earnings-period">
          <span className="period-label">Cette semaine</span>
          <span className="period-value">{formatXOF(week_xof)}</span>
          <span className="period-trips">{week_trips} course{week_trips !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active assistance card — shown when driver has an ongoing intervention
// ---------------------------------------------------------------------------

function ActiveAssistanceCard({ token, request, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleAction(fn) {
    setBusy(true); setError(null);
    try { const updated = await fn(token, request.request_id); onUpdate(updated); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const typeLabel = ASSISTANCE_TYPE_LABELS[request.type] ?? request.type;

  return (
    <div className={`active-trip-card active-${request.status}`}>
      <div className="assist-type-chip">{typeLabel}</div>
      <div className="active-status">{ASSISTANCE_STATUS_LABELS[request.status] ?? request.status}</div>
      {request.note && <p className="assist-note">{request.note}</p>}
      {error && <p className="form-error">{error}</p>}
      {request.status === "accepted" && (
        <button className="action-btn start-btn" onClick={() => handleAction(startAssistance)} disabled={busy}>
          {busy ? "…" : "🔧 Démarrer l'intervention"}
        </button>
      )}
      {request.status === "in_progress" && (
        <button className="action-btn complete-btn" onClick={() => handleAction(resolveAssistance)} disabled={busy}>
          {busy ? "…" : "✅ Terminer l'intervention"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unified dispatch list — pending trips + assistance requests
// ---------------------------------------------------------------------------

function AvailableTripsSection({ token, onTripAccepted, onAssistanceAccepted }) {
  const [trips, setTrips] = useState([]);
  const [assistance, setAssistance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [t, a] = await Promise.all([
        listAvailableTrips(token),
        listAvailableAssistance(token),
      ]);
      setTrips(t);
      setAssistance(a);
    } catch (_) { /* silent */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleAcceptTrip(tripId) {
    setAccepting(tripId); setError(null);
    try { onTripAccepted(await acceptTrip(token, tripId)); }
    catch (e) { setError(e.message); setAccepting(null); }
  }

  async function handleAcceptAssistance(reqId) {
    setAccepting(reqId); setError(null);
    try { onAssistanceAccepted(await acceptAssistance(token, reqId)); }
    catch (e) { setError(e.message); setAccepting(null); }
  }

  const totalItems = trips.length + assistance.length;

  return (
    <div className="available-section">
      <div className="available-header">
        <h2 className="section-title">Dispatch</h2>
        <span className="live-badge">● Live</span>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && totalItems === 0 && (
        <div className="status loading">⏳ Chargement…</div>
      )}
      {!loading && totalItems === 0 && (
        <div className="empty-state">Aucune mission disponible pour le moment.</div>
      )}
      <div className="trip-list">
        {trips.map((t) => (
          <div key={t.trip_id} className="trip-card">
            <div className="dispatch-tag tag-ride">🚕 Trajet</div>
            <div className="trip-card-fare">{t.fare_xof ? formatXOF(t.fare_xof) : "—"}</div>
            <div className="trip-card-meta">
              {t.distance_km != null && <span>🛣️ {t.distance_km.toFixed(1)} km</span>}
              {t.duration_min != null && <span>⏱️ ~{t.duration_min} min</span>}
            </div>
            <button
              className="action-btn accept-btn"
              onClick={() => handleAcceptTrip(t.trip_id)}
              disabled={accepting === t.trip_id}
            >
              {accepting === t.trip_id ? "Acceptation…" : "✓ Accepter"}
            </button>
          </div>
        ))}
        {assistance.map((a) => (
          <div key={a.request_id} className="trip-card assist-card">
            <div className="dispatch-tag tag-assist">🆘 Assistance</div>
            <div className="trip-card-fare assist-type">
              {ASSISTANCE_TYPE_LABELS[a.type] ?? a.type}
            </div>
            {a.note && <div className="trip-card-meta"><span>{a.note}</span></div>}
            <button
              className="action-btn accept-btn"
              onClick={() => handleAcceptAssistance(a.request_id)}
              disabled={accepting === a.request_id}
            >
              {accepting === a.request_id ? "Acceptation…" : "✓ Accepter"}
            </button>
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
  const [activeAssistance, setActiveAssistance] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [ratingStats, setRatingStats] = useState(null);
  const [earnings, setEarnings] = useState(null);

  // On mount: check active trip + active assistance + rating stats + earnings in parallel
  useEffect(() => {
    Promise.all([
      getActiveTrip(token).then(({ trip }) => { setActiveTrip(trip); }),
      getActiveAssistance(token).then(({ request }) => { setActiveAssistance(request); }).catch(() => {}),
      getMyRating(token).then(setRatingStats).catch(() => {}),
      getMyEarnings(token).then(setEarnings).catch(() => {}),
    ]).finally(() => setInitialized(true));
  }, [token]);

  // Poll active trip status every 5s (if active)
  useEffect(() => {
    if (!activeTrip) return;
    if (["completed", "cancelled"].includes(activeTrip.status)) return;
    const id = setInterval(() => {
      getActiveTrip(token)
        .then(({ trip }) => setActiveTrip(trip))
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [activeTrip?.trip_id, activeTrip?.status]);

  function refreshStats() {
    getMyRating(token).then(setRatingStats).catch(() => {});
    getMyEarnings(token).then(setEarnings).catch(() => {});
  }

  function handleTripUpdate(updated) {
    setActiveTrip(updated);
    if (["completed", "cancelled"].includes(updated.status)) {
      if (updated.status === "completed") {
        setTimeout(refreshStats, 2000);
      }
      setTimeout(() => setActiveTrip(null), 3000);
    }
  }

  function handleAssistanceUpdate(updated) {
    setActiveAssistance(updated);
    if (["resolved", "cancelled"].includes(updated.status)) {
      setTimeout(() => setActiveAssistance(null), 3000);
    }
  }

  if (!initialized) {
    return (
      <div className="app">
        <div className="status loading">⏳ Chargement…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="dash-header">
        <h1>Ziza Driver</h1>
        <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
      </header>
      <div className="status ok">✓ Connecté — <strong>{user.email}</strong></div>
      <div className="role-badge">{user.role} · {user.provider}</div>

      <EarningsCard earnings={earnings} />
      <RatingStats stats={ratingStats} />

      {activeTrip && !["completed", "cancelled"].includes(activeTrip.status) ? (
        <ActiveTripCard token={token} trip={activeTrip} onUpdate={handleTripUpdate} />
      ) : activeAssistance && !["resolved", "cancelled"].includes(activeAssistance.status) ? (
        <ActiveAssistanceCard token={token} request={activeAssistance} onUpdate={handleAssistanceUpdate} />
      ) : (
        <AvailableTripsSection
          token={token}
          onTripAccepted={setActiveTrip}
          onAssistanceAccepted={setActiveAssistance}
        />
      )}

      <p className="footer">App: <strong>web-driver</strong> · Sprint 11</p>
    </div>
  );
}

function AccessDenied({ role, onLogout }) {
  return (
    <div className="app">
      <h1>Ziza Driver</h1>
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

  // After login: upsert user row + driver profile
  useEffect(() => {
    if (!user || user.role !== REQUIRED_ROLE) return;
    registerUser(token)
      .then(() => registerDriver(token))
      .catch(() => {});
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
