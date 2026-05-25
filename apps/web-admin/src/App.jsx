import { useEffect, useState, useCallback } from "react";
import {
  login, fetchMe, registerUser,
  adminListDrivers, adminSetDriverCapabilities,
  adminGetStats, adminListTrips, adminListUsers, adminListAssistance,
  adminCreatePromo, adminListPromos, adminDeactivatePromo, adminSetDriverStatus,
} from "./api";
import { firebaseEnabled, signInWithGoogle, firebaseSignOut } from "./auth";

const REQUIRED_ROLE = "admin";
const TOKEN_KEY = "ziza_token";

const ASSISTANCE_TYPES = ["breakdown", "flat_tyre", "tow", "fuel", "lockout"];

const TYPE_LABELS = {
  breakdown: "🔧 Panne mécanique",
  flat_tyre: "🔴 Pneu crevé",
  tow:       "🚛 Remorquage",
  fuel:      "⛽ Carburant",
  lockout:   "🔑 Clés perdues",
};

const STATUS_LABELS = {
  pending:     "En attente",
  accepted:    "Acceptée",
  in_progress: "En cours",
  completed:   "Terminée",
  cancelled:   "Annulée",
  resolved:    "Résolue",
};

function formatXOF(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR").format(n) + " XOF";
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({ onEmailLogin, onGoogleLogin, error, loading }) {
  const [email, setEmail] = useState("admin@ziza.dev");
  const [password, setPassword] = useState("ziza2024");
  return (
    <div className="app">
      <h1>Ziza Admin</h1>
      <p className="subtitle">Sprint 14 — Codes promo & gestion chauffeurs</p>
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
      <p className="hint">Dev: admin@ziza.dev / ziza2024</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats panel — Sprint 11
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function StatsPanel({ token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setStats(await adminGetStats(token)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading && !stats) return <div className="status loading">⏳ Chargement statistiques…</div>;
  if (error) return <p className="form-error">{error}</p>;
  if (!stats) return null;

  const { trips, assistance, drivers } = stats;

  return (
    <div className="stats-panel">
      <div className="panel-header">
        <h2 className="panel-title">Vue d'ensemble</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>
      <div className="stats-grid">
        <StatCard
          label="Courses totales"
          value={trips.total}
          sub={`${trips.by_status?.completed ?? 0} terminées · ${trips.by_status?.pending ?? 0} en attente`}
        />
        <StatCard
          label="Chiffre d'affaires"
          value={formatXOF(trips.total_revenue_xof)}
          sub="Courses terminées"
        />
        <StatCard
          label="Assistances"
          value={assistance.total}
          sub={`${assistance.by_status?.resolved ?? 0} résolues · ${assistance.by_status?.pending ?? 0} en attente`}
        />
        <StatCard
          label="Chauffeurs"
          value={drivers.total}
          sub={`${drivers.by_status?.active ?? 0} actifs`}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trip list panel — Sprint 11
// ---------------------------------------------------------------------------

function TripRow({ trip }) {
  return (
    <div className="trip-row">
      <div className="trip-row-main">
        <span className={`trip-status-badge status-${trip.status}`}>
          {STATUS_LABELS[trip.status] ?? trip.status}
        </span>
        <span className="trip-customer">{trip.customer_email}</span>
        {trip.fare_xof && <span className="trip-fare">{formatXOF(trip.fare_xof)}</span>}
      </div>
      <div className="trip-row-meta">
        {trip.distance_km != null && <span>🛣️ {trip.distance_km.toFixed(1)} km</span>}
        {trip.duration_min != null && <span>⏱️ {trip.duration_min} min</span>}
        <span className="trip-date">{new Date(trip.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
      </div>
    </div>
  );
}

function TripsPanel({ token }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [error, setError] = useState(null);
  const PAGE_SIZE = 10;

  const load = useCallback(async (p = 0) => {
    setLoading(true); setError(null);
    try {
      const data = await adminListTrips(token, PAGE_SIZE, p * PAGE_SIZE);
      setTrips(data);
      setPage(p);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  return (
    <div className="trips-panel">
      <div className="panel-header">
        <h2 className="panel-title">Toutes les courses</h2>
        <div className="panel-actions">
          <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!loading && trips.length === 0 && (
        <div className="empty-state">Aucune course enregistrée.</div>
      )}
      <div className="trip-list-admin">
        {trips.map((t) => <TripRow key={t.trip_id} trip={t} />)}
      </div>
      {(trips.length === PAGE_SIZE || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Précédent</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={trips.length < PAGE_SIZE || loading}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capability editor — inline for a single driver
// ---------------------------------------------------------------------------

function CapabilityEditor({ token, driver, onSaved, onCancel }) {
  const [selected, setSelected] = useState(new Set(driver.capabilities));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function toggle(type) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const result = await adminSetDriverCapabilities(token, driver.driver_id, Array.from(selected));
      onSaved({ ...driver, capabilities: result.capabilities });
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="cap-editor">
      <div className="cap-editor-title">Compétences — <strong>{driver.email}</strong></div>
      <div className="cap-hint">Vide = le chauffeur voit toutes les demandes d'assistance.</div>
      <div className="cap-grid">
        {ASSISTANCE_TYPES.map((type) => (
          <button key={type} className={`cap-btn ${selected.has(type) ? "selected" : ""}`} onClick={() => toggle(type)}>
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="cap-actions">
        <button className="cap-save-btn" onClick={handleSave} disabled={saving}>{saving ? "Enregistrement…" : "✓ Enregistrer"}</button>
        <button className="cap-cancel-btn" onClick={onCancel} disabled={saving}>Annuler</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Driver row
// ---------------------------------------------------------------------------

function DriverRow({ driver, onEdit, onStatusChange }) {
  const [changingStatus, setChangingStatus] = useState(false);

  async function handleStatus(newStatus) {
    setChangingStatus(true);
    try { await onStatusChange(driver.driver_id, newStatus); }
    finally { setChangingStatus(false); }
  }

  return (
    <div className="driver-card">
      <div className="driver-card-header">
        <div>
          <span className="driver-email">{driver.email}</span>
          <span className={`driver-status-badge ${driver.status}`}>{driver.status}</span>
        </div>
        <div className="driver-card-actions">
          <button className="edit-caps-btn" onClick={() => onEdit(driver)}>Compétences</button>
          {driver.status !== "suspended" ? (
            <button
              className="suspend-btn"
              onClick={() => handleStatus("suspended")}
              disabled={changingStatus}
              title="Suspendre ce chauffeur"
            >
              🚫
            </button>
          ) : (
            <button
              className="activate-btn"
              onClick={() => handleStatus("active")}
              disabled={changingStatus}
              title="Réactiver ce chauffeur"
            >
              ✅
            </button>
          )}
        </div>
      </div>
      <div className="driver-caps">
        {driver.capabilities.length > 0
          ? driver.capabilities.map((c) => <span key={c} className="cap-chip">{TYPE_LABELS[c] ?? c}</span>)
          : <span className="cap-all">Toutes les demandes</span>
        }
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drivers panel
// ---------------------------------------------------------------------------

function DriversPanel({ token }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setDrivers(await adminListDrivers(token)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function handleSaved(updated) {
    setDrivers((prev) => prev.map((d) => d.driver_id === updated.driver_id ? updated : d));
    setEditing(null);
  }

  async function handleStatusChange(driverId, newStatus) {
    try {
      const result = await adminSetDriverStatus(token, driverId, newStatus);
      setDrivers((prev) => prev.map((d) =>
        d.driver_id === driverId ? { ...d, status: result.status } : d
      ));
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="drivers-panel">
      <div className="panel-header">
        <h2 className="panel-title">Chauffeurs enregistrés</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>{loading ? "…" : "↻ Actualiser"}</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {editing && <CapabilityEditor token={token} driver={editing} onSaved={handleSaved} onCancel={() => setEditing(null)} />}
      {!loading && drivers.length === 0 && <div className="empty-state">Aucun chauffeur enregistré.</div>}
      <div className="driver-list">
        {drivers.map((d) => (
          <DriverRow key={d.driver_id} driver={d} onEdit={setEditing} onStatusChange={handleStatusChange} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users panel — Sprint 12
// ---------------------------------------------------------------------------

const ROLE_COLORS = { admin: "role-admin", driver: "role-driver", customer: "role-customer" };

function UserRow({ u }) {
  return (
    <div className="user-row">
      <div className="user-row-main">
        <span className={`user-role-badge ${ROLE_COLORS[u.role] ?? ""}`}>{u.role}</span>
        <span className="user-email">{u.email}</span>
      </div>
      <div className="user-row-meta">
        <span className="user-provider">{u.provider}</span>
        <span className="user-date">{new Date(u.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
      </div>
    </div>
  );
}

function UsersPanel({ token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setUsers(await adminListUsers(token)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="users-panel">
      <div className="panel-header">
        <h2 className="panel-title">Utilisateurs enregistrés</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>{loading ? "…" : "↻"}</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!loading && users.length === 0 && <div className="empty-state">Aucun utilisateur enregistré.</div>}
      <div className="user-list">
        {users.map((u) => <UserRow key={u.user_id} u={u} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistance panel — Sprint 13
// ---------------------------------------------------------------------------

const ASSIST_TYPE_LABELS = {
  breakdown: "🔧 Panne",
  flat_tyre: "🔴 Pneu",
  tow:       "🚛 Remorquage",
  fuel:      "⛽ Carburant",
  lockout:   "🔑 Clés",
};

function AssistanceRow({ req }) {
  return (
    <div className="assist-row">
      <div className="assist-row-main">
        <span className={`trip-status-badge status-${req.status}`}>
          {STATUS_LABELS[req.status] ?? req.status}
        </span>
        <span className="assist-type-label">{ASSIST_TYPE_LABELS[req.type] ?? req.type}</span>
        <span className="trip-customer">{req.customer_email}</span>
      </div>
      <div className="assist-row-meta">
        {req.eta_min != null && <span>⏱️ ETA {req.eta_min} min</span>}
        {req.note && <span className="assist-note-admin">"{req.note}"</span>}
        <span className="trip-date">{new Date(req.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>
      </div>
    </div>
  );
}

function AssistancePanel({ token }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [error, setError] = useState(null);
  const PAGE_SIZE = 10;

  const load = useCallback(async (p = 0) => {
    setLoading(true); setError(null);
    try {
      const data = await adminListAssistance(token, PAGE_SIZE, p * PAGE_SIZE);
      setRequests(data);
      setPage(p);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  return (
    <div className="assist-panel">
      <div className="panel-header">
        <h2 className="panel-title">Demandes d'assistance</h2>
        <div className="panel-actions">
          <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!loading && requests.length === 0 && (
        <div className="empty-state">Aucune demande enregistrée.</div>
      )}
      <div className="trip-list-admin">
        {requests.map((r) => <AssistanceRow key={r.request_id} req={r} />)}
      </div>
      {(requests.length === PAGE_SIZE || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Précédent</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={requests.length < PAGE_SIZE || loading}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Promo panel — Sprint 14
// ---------------------------------------------------------------------------

function PromoPanel({ token }) {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Form state
  const [code, setCode] = useState("");
  const [pct, setPct] = useState("10");
  const [maxUses, setMaxUses] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPromos(await adminListPromos(token)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setCreating(true); setCreateError(null);
    try {
      await adminCreatePromo(token, code.trim(), Number(pct), maxUses ? Number(maxUses) : null, null);
      setCode(""); setPct("10"); setMaxUses("");
      await load();
    } catch (e) { setCreateError(e.message); }
    finally { setCreating(false); }
  }

  async function handleDeactivate(promoCode) {
    try {
      await adminDeactivatePromo(token, promoCode);
      setPromos((prev) => prev.map((p) => p.code === promoCode ? { ...p, active: false } : p));
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="promo-panel">
      <div className="panel-header">
        <h2 className="panel-title">Codes promo</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>

      {/* Create form */}
      <form className="promo-create-form" onSubmit={handleCreate}>
        <div className="promo-form-row">
          <input
            className="promo-code-input"
            placeholder="Code (ex: ZIZA10)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={32}
            required
          />
          <input
            className="promo-pct-input"
            type="number"
            min="1"
            max="100"
            placeholder="% remise"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            required
          />
          <input
            className="promo-max-input"
            type="number"
            min="1"
            placeholder="Max utilisations"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
          <button type="submit" className="cap-save-btn" disabled={creating}>
            {creating ? "…" : "✚ Créer"}
          </button>
        </div>
        {createError && <p className="form-error">{createError}</p>}
      </form>

      {error && <p className="form-error">{error}</p>}
      {!loading && promos.length === 0 && (
        <div className="empty-state">Aucun code promo créé.</div>
      )}
      <div className="promo-list">
        {promos.map((p) => (
          <div key={p.promo_id} className={`promo-row ${p.active ? "" : "promo-inactive"}`}>
            <div className="promo-row-main">
              <span className="promo-code-badge">{p.code}</span>
              <span className="promo-pct">-{p.discount_pct}%</span>
              <span className={`promo-status ${p.active ? "active" : "inactive"}`}>
                {p.active ? "Actif" : "Inactif"}
              </span>
            </div>
            <div className="promo-row-meta">
              <span>{p.uses} utilisation{p.uses !== 1 ? "s" : ""}{p.max_uses ? ` / ${p.max_uses}` : ""}</span>
              {p.expires_at && <span>Expire: {new Date(p.expires_at).toLocaleDateString("fr-FR")}</span>}
            </div>
            {p.active && (
              <button className="promo-deactivate-btn" onClick={() => handleDeactivate(p.code)}>
                Désactiver
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard — tabbed navigation
// ---------------------------------------------------------------------------

const TABS = [
  { id: "stats",     label: "📊 Stats" },
  { id: "trips",     label: "🚕 Courses" },
  { id: "assist",    label: "🆘 Assistances" },
  { id: "drivers",   label: "🧑‍✈️ Chauffeurs" },
  { id: "promos",    label: "🏷️ Promos" },
  { id: "users",     label: "👥 Utilisateurs" },
];

function Dashboard({ user, token, onLogout }) {
  const [activeTab, setActiveTab] = useState("stats");

  return (
    <div className="app admin-app">
      <header className="dash-header">
        <h1>Ziza Admin</h1>
        <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
      </header>
      <div className="status ok">✓ Connecté — <strong>{user.email}</strong></div>
      <div className="role-badge">{user.role} · {user.provider}</div>

      <div className="admin-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`admin-tab ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "stats"   && <StatsPanel      token={token} />}
      {activeTab === "trips"   && <TripsPanel      token={token} />}
      {activeTab === "assist"  && <AssistancePanel token={token} />}
      {activeTab === "drivers" && <DriversPanel    token={token} />}
      {activeTab === "promos"  && <PromoPanel      token={token} />}
      {activeTab === "users"   && <UsersPanel      token={token} />}

      <p className="footer">App: <strong>web-admin</strong> · Sprint 14</p>
    </div>
  );
}

function AccessDenied({ role, onLogout }) {
  return (
    <div className="app">
      <h1>Ziza Admin</h1>
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
