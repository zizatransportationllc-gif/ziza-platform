import { useEffect, useState, useCallback } from "react";
import {
  login, fetchMe, registerUser,
  adminListDrivers, adminSetDriverCapabilities,
  adminGetStats, adminListTrips, adminListUsers, adminListAssistance,
  adminCreatePromo, adminListPromos, adminDeactivatePromo, adminSetDriverStatus,
  adminListPayouts, adminUpdatePayoutStatus, adminListRatings,
  adminGetSurge, adminSetSurge,
  adminListDocuments, adminUpdateDocumentStatus, adminGetPendingCounts,
  getCommissionSettings, setCommission, runPayoutBatch, // Sprint 29
  adminListApplications, adminReviewApplication, // Sprint 30
  adminListFlags, adminSetFlag, // Sprint 31
  adminListLiveDrivers, adminSetUserRole, adminCreateInviteCode, // Sprint 31
  adminListCities, adminCreateCity, adminUpdateCity, // Sprint 32
  adminGetKPIs, adminGetRevenue, adminGetDriverPerformance, // Sprint 34
  adminGetCategoryBreakdown, adminGetHourlyDemand, adminGetTopCustomers, // Sprint 34
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
      <p className="subtitle">Sprint 34 — Analytics avancées</p>
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
// Documents Panel — Sprint 17
// ---------------------------------------------------------------------------

const DOC_TYPE_LABELS = {
  license:      "🪪 Permis de conduire",
  insurance:    "📋 Assurance",
  registration: "📄 Carte grise",
  id_card:      "🪪 Carte d'identité",
};

const DOC_STATUS_LABELS = {
  pending:  "⏳ En attente",
  approved: "✅ Approuvé",
  rejected: "✗ Rejeté",
};

const PAGE_SIZE_DOCS = 10;

function DocumentsPanel({ token }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [acting, setActing] = useState(null);
  const [noteInputs, setNoteInputs] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback((p = 0) => {
    setPage(p); setLoading(true); setError(null);
    adminListDocuments(token, PAGE_SIZE_DOCS, p * PAGE_SIZE_DOCS)
      .then(setDocs).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  async function handleStatus(docId, newStatus) {
    const note = noteInputs[docId] || null;
    setActing(docId);
    try {
      const updated = await adminUpdateDocumentStatus(token, docId, newStatus, note);
      setDocs((prev) => prev.map((d) =>
        d.document_id === docId ? { ...d, status: updated.status, note_admin: updated.note_admin } : d
      ));
    } catch (e) { setError(e.message); }
    finally { setActing(null); }
  }

  return (
    <div className="documents-panel-admin">
      <div className="panel-header">
        <h2 className="panel-title">📄 Documents KYC</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && <div className="status loading">⏳ Chargement…</div>}
      {!loading && docs.length === 0 && <p className="muted-msg">Aucun document soumis.</p>}
      {docs.map((d) => (
        <div key={d.document_id} className={`doc-admin-row doc-admin-${d.status}`}>
          <div className="doc-admin-main">
            <span className="doc-admin-type">{DOC_TYPE_LABELS[d.type] ?? d.type}</span>
            <span className={`doc-admin-status doc-admin-status-${d.status}`}>
              {DOC_STATUS_LABELS[d.status] ?? d.status}
            </span>
          </div>
          <div className="doc-admin-meta">
            <span>🧑‍✈️ {d.driver_email}</span>
            <a className="doc-admin-url" href={d.url} target="_blank" rel="noreferrer">Voir le document ↗</a>
            <span>{new Date(d.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
          {d.note_admin && <p className="doc-admin-note">💬 {d.note_admin}</p>}
          {d.status === "pending" && (
            <div className="doc-admin-actions">
              <input
                className="payout-note-input"
                type="text"
                placeholder="Note (optionnelle)"
                value={noteInputs[d.document_id] ?? ""}
                onChange={(e) => setNoteInputs((prev) => ({ ...prev, [d.document_id]: e.target.value }))}
              />
              <button
                className="payout-approve-btn"
                disabled={acting === d.document_id}
                onClick={() => handleStatus(d.document_id, "approved")}
              >✅ Approuver</button>
              <button
                className="payout-reject-btn"
                disabled={acting === d.document_id}
                onClick={() => handleStatus(d.document_id, "rejected")}
              >✗ Rejeter</button>
            </div>
          )}
        </div>
      ))}
      {(docs.length === PAGE_SIZE_DOCS || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Précédent</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={docs.length < PAGE_SIZE_DOCS || loading}>Suivant →</button>
        </div>
      )}
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

// ---------------------------------------------------------------------------
// Trip filter bar — Sprint 19
// ---------------------------------------------------------------------------

const TRIP_STATUSES = [
  { value: "",            label: "Tous les statuts" },
  { value: "pending",     label: "En attente" },
  { value: "accepted",    label: "Acceptée" },
  { value: "in_progress", label: "En cours" },
  { value: "completed",   label: "Terminée" },
  { value: "cancelled",   label: "Annulée" },
];

function TripFilterBar({ filters, onChange, onSearch, onReset, loading }) {
  return (
    <div className="filter-bar">
      <select
        className="filter-select"
        value={filters.status}
        onChange={(e) => onChange("status", e.target.value)}
      >
        {TRIP_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <input
        className="filter-input"
        type="text"
        placeholder="Email client…"
        value={filters.customerEmail}
        onChange={(e) => onChange("customerEmail", e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
      />
      <input
        className="filter-input filter-date"
        type="date"
        value={filters.dateFrom}
        onChange={(e) => onChange("dateFrom", e.target.value)}
        title="Date début"
      />
      <input
        className="filter-input filter-date"
        type="date"
        value={filters.dateTo}
        onChange={(e) => onChange("dateTo", e.target.value)}
        title="Date fin"
      />
      <button className="filter-search-btn" onClick={onSearch} disabled={loading}>🔍</button>
      <button className="filter-reset-btn" onClick={onReset} disabled={loading} title="Réinitialiser">✕</button>
    </div>
  );
}

function TripsPanel({ token }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ status: "", customerEmail: "", dateFrom: "", dateTo: "" });
  const [activeFilters, setActiveFilters] = useState({ status: "", customerEmail: "", dateFrom: "", dateTo: "" });
  const PAGE_SIZE = 10;

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const load = useCallback(async (p = 0, f = activeFilters) => {
    setLoading(true); setError(null);
    try {
      const data = await adminListTrips(
        token, PAGE_SIZE, p * PAGE_SIZE,
        f.status || null,
        f.customerEmail.trim() || null,
        f.dateFrom || null,
        f.dateTo || null,
      );
      setTrips(data);
      setPage(p);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, activeFilters]);

  useEffect(() => { load(0, activeFilters); }, [activeFilters]); // eslint-disable-line

  function handleSearch() {
    setActiveFilters({ ...filters });
  }

  function handleReset() {
    const empty = { status: "", customerEmail: "", dateFrom: "", dateTo: "" };
    setFilters(empty);
    setActiveFilters(empty);
  }

  return (
    <div className="trips-panel">
      <div className="panel-header">
        <h2 className="panel-title">Toutes les courses</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>
      <TripFilterBar
        filters={filters}
        onChange={updateFilter}
        onSearch={handleSearch}
        onReset={handleReset}
        loading={loading}
      />
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

// ---------------------------------------------------------------------------
// User filter bar — Sprint 19
// ---------------------------------------------------------------------------

const USER_ROLES = [
  { value: "",         label: "Tous les rôles" },
  { value: "admin",    label: "Admin" },
  { value: "driver",   label: "Chauffeur" },
  { value: "customer", label: "Client" },
];

function UsersPanel({ token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [activeRole, setActiveRole] = useState("");
  const [activeEmail, setActiveEmail] = useState("");

  const load = useCallback(async (role = activeRole, email = activeEmail) => {
    setLoading(true); setError(null);
    try { setUsers(await adminListUsers(token, role || null, email.trim() || null)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, activeRole, activeEmail]);

  useEffect(() => { load(activeRole, activeEmail); }, [activeRole, activeEmail]); // eslint-disable-line

  function handleSearch() {
    setActiveRole(roleFilter);
    setActiveEmail(emailFilter);
  }

  function handleReset() {
    setRoleFilter(""); setEmailFilter("");
    setActiveRole(""); setActiveEmail("");
  }

  return (
    <div className="users-panel">
      <div className="panel-header">
        <h2 className="panel-title">Utilisateurs enregistrés</h2>
        <button className="refresh-btn" onClick={() => load(activeRole, activeEmail)} disabled={loading}>{loading ? "…" : "↻"}</button>
      </div>

      {/* Sprint 19: user search bar */}
      <div className="filter-bar">
        <select
          className="filter-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          {USER_ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <input
          className="filter-input"
          type="text"
          placeholder="Email…"
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button className="filter-search-btn" onClick={handleSearch} disabled={loading}>🔍</button>
        <button className="filter-reset-btn" onClick={handleReset} disabled={loading} title="Réinitialiser">✕</button>
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
// Payouts Panel — Sprint 15
// ---------------------------------------------------------------------------

const PAYOUT_STATUS_LABELS = {
  pending:  "⏳ En attente",
  approved: "✅ Approuvé",
  rejected: "✗ Rejeté",
};

const PAGE_SIZE_PAYOUT = 10;

function PayoutsPanel({ token }) {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [acting, setActing] = useState(null);
  const [noteInputs, setNoteInputs] = useState({});

  const load = useCallback((p = 0) => {
    setPage(p); setLoading(true);
    adminListPayouts(token, PAGE_SIZE_PAYOUT, p * PAGE_SIZE_PAYOUT)
      .then(setPayouts).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  async function handleStatus(payoutId, newStatus) {
    const note = noteInputs[payoutId] || null;
    setActing(payoutId);
    try {
      const updated = await adminUpdatePayoutStatus(token, payoutId, newStatus, note);
      setPayouts((prev) => prev.map((p) =>
        p.payout_id === payoutId ? { ...p, status: updated.status, note_admin: updated.note_admin } : p
      ));
    } catch (_) {}
    finally { setActing(null); }
  }

  return (
    <div className="payouts-panel">
      <div className="panel-header">
        <h2 className="panel-title">💸 Demandes de retrait</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>
      {loading && <div className="status loading">⏳ Chargement…</div>}
      {!loading && payouts.length === 0 && <p className="muted-msg">Aucune demande de retrait.</p>}
      {payouts.map((p) => (
        <div key={p.payout_id} className={`payout-row payout-row-${p.status}`}>
          <div className="payout-row-main">
            <span className="payout-row-amount">{formatXOF(p.amount_xof)}</span>
            <span className={`payout-row-status status-${p.status}`}>
              {PAYOUT_STATUS_LABELS[p.status] ?? p.status}
            </span>
          </div>
          <div className="payout-row-meta">
            <span>🧑‍✈️ {p.driver_email}</span>
            <span>{new Date(p.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
          {p.note_admin && <p className="payout-row-note">💬 {p.note_admin}</p>}
          {p.status === "pending" && (
            <div className="payout-row-actions">
              <input
                className="payout-note-input"
                type="text"
                placeholder="Note (optionnelle)"
                value={noteInputs[p.payout_id] ?? ""}
                onChange={(e) => setNoteInputs((prev) => ({ ...prev, [p.payout_id]: e.target.value }))}
              />
              <button
                className="payout-approve-btn"
                disabled={acting === p.payout_id}
                onClick={() => handleStatus(p.payout_id, "approved")}
              >✅ Approuver</button>
              <button
                className="payout-reject-btn"
                disabled={acting === p.payout_id}
                onClick={() => handleStatus(p.payout_id, "rejected")}
              >✗ Rejeter</button>
            </div>
          )}
        </div>
      ))}
      {(payouts.length === PAGE_SIZE_PAYOUT || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Précédent</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={payouts.length < PAGE_SIZE_PAYOUT || loading}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commission Panel — Sprint 29
// ---------------------------------------------------------------------------

const COMMISSION_CATEGORY_LABELS = {
  economy:    "🚗 Economy",
  comfort:    "🚙 Comfort",
  premium:    "🏎️ Premium",
  assistance: "🔧 Assistance",
  default:    "📦 Défaut",
};

function CommissionPanel({ token }) {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // { category, rate_pct }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Batch payout state
  const [batching, setBatching] = useState(false);
  const [batchResult, setBatchResult] = useState(null);
  const [batchError, setBatchError] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    getCommissionSettings(token)
      .then(setSettings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function startEdit(cat) {
    const found = settings.find((s) => s.category === cat);
    setEditing({ category: cat, rate_pct: String(found?.rate_pct ?? 15) });
    setSaveError(null);
    setSaveSuccess(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!editing) return;
    const rate = parseInt(editing.rate_pct, 10);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      setSaveError("Le taux doit être entre 0 et 100."); return;
    }
    setSaving(true); setSaveError(null);
    try {
      await setCommission(token, editing.category, rate);
      setSaveSuccess(true);
      setEditing(null);
      await load();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) { setSaveError(err.message); }
    finally { setSaving(false); }
  }

  async function handleBatch() {
    setBatching(true); setBatchResult(null); setBatchError(null);
    try {
      const result = await runPayoutBatch(token);
      setBatchResult(result);
    } catch (err) { setBatchError(err.message); }
    finally { setBatching(false); }
  }

  const CATS = ["economy", "comfort", "premium", "assistance", "default"];

  return (
    <div className="commission-panel">
      <div className="panel-header">
        <h2 className="panel-title">💰 Commission &amp; Batch payout</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>

      {/* Commission rates table */}
      <section className="commission-section">
        <h3 className="commission-section-title">Taux de commission par catégorie</h3>
        {error && <p className="form-error">{error}</p>}
        {loading && <div className="status loading">⏳ Chargement…</div>}
        {!loading && (
          <div className="commission-grid">
            {CATS.map((cat) => {
              const setting = settings.find((s) => s.category === cat);
              return (
                <div key={cat} className="commission-row">
                  <span className="commission-cat-label">{COMMISSION_CATEGORY_LABELS[cat] ?? cat}</span>
                  <span className="commission-rate">
                    {setting ? `${setting.rate_pct}%` : "—"}
                  </span>
                  <button
                    className="commission-edit-btn"
                    onClick={() => startEdit(cat)}
                    disabled={saving}
                  >
                    Modifier
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Inline edit form */}
        {editing && (
          <form className="commission-edit-form" onSubmit={handleSave}>
            <div className="commission-edit-row">
              <span className="commission-edit-label">
                {COMMISSION_CATEGORY_LABELS[editing.category]} — taux (%)
              </span>
              <input
                className="commission-rate-input"
                type="number"
                min="0"
                max="100"
                step="1"
                value={editing.rate_pct}
                onChange={(e) => setEditing((prev) => ({ ...prev, rate_pct: e.target.value }))}
                required
              />
              <button className="cap-save-btn" type="submit" disabled={saving}>
                {saving ? "…" : "✓ Enregistrer"}
              </button>
              <button
                className="cap-cancel-btn"
                type="button"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                Annuler
              </button>
            </div>
            {saveError && <p className="form-error">{saveError}</p>}
          </form>
        )}
        {saveSuccess && <p className="surge-success">✓ Taux mis à jour avec succès</p>}
      </section>

      {/* Batch payout section */}
      <section className="commission-section batch-section">
        <h3 className="commission-section-title">Batch payout</h3>
        <p className="commission-hint">
          Lance le traitement de toutes les demandes de retrait approuvées.
          Les demandes déjà traitées sont ignorées (idempotent).
        </p>
        <button
          className="batch-run-btn"
          onClick={handleBatch}
          disabled={batching}
        >
          {batching ? "⏳ Traitement en cours…" : "🚀 Lancer batch payout"}
        </button>

        {batchError && <p className="form-error">✗ {batchError}</p>}
        {batchResult && (
          <div className="batch-result">
            <div className="batch-result-row">
              <span className="batch-result-label">✅ Traitées</span>
              <span className="batch-result-value">{batchResult.processed}</span>
            </div>
            <div className="batch-result-row">
              <span className="batch-result-label">✗ Échouées</span>
              <span className="batch-result-value">{batchResult.failed}</span>
            </div>
            <div className="batch-result-row">
              <span className="batch-result-label">Montant net total</span>
              <span className="batch-result-value">{formatXOF(batchResult.total_net_xof)}</span>
            </div>
            <div className="batch-result-row">
              <span className="batch-result-label">Commission totale</span>
              <span className="batch-result-value">{formatXOF(batchResult.total_commission_xof)}</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ratings Panel — Sprint 15
// ---------------------------------------------------------------------------

const PAGE_SIZE_RATINGS = 10;

function StarDisplay({ stars }) {
  return (
    <span className="rating-stars">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= stars ? "star-filled" : "star-empty"}>★</span>
      ))}
    </span>
  );
}

function RatingsPanel({ token }) {
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const load = useCallback((p = 0) => {
    setPage(p); setLoading(true);
    adminListRatings(token, PAGE_SIZE_RATINGS, p * PAGE_SIZE_RATINGS)
      .then(setRatings).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  return (
    <div className="ratings-panel">
      <div className="panel-header">
        <h2 className="panel-title">⭐ Avis clients</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>
      {loading && <div className="status loading">⏳ Chargement…</div>}
      {!loading && ratings.length === 0 && <p className="muted-msg">Aucun avis pour l&apos;instant.</p>}
      {ratings.map((r) => (
        <div key={r.rating_id} className="rating-row">
          <div className="rating-row-main">
            <StarDisplay stars={r.stars} />
            <span className="rating-customer">{r.customer_email}</span>
          </div>
          {r.comment && <p className="rating-comment">&ldquo;{r.comment}&rdquo;</p>}
          <div className="rating-row-meta">
            <span>🧑‍✈️ Chauffeur {r.driver_id.slice(0, 8)}…</span>
            <span>{new Date(r.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
        </div>
      ))}
      {(ratings.length === PAGE_SIZE_RATINGS || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Précédent</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={ratings.length < PAGE_SIZE_RATINGS || loading}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surge Pricing Panel — Sprint 16
// ---------------------------------------------------------------------------

function SurgePanel({ token }) {
  const [current, setCurrent] = useState(null);
  const [input, setInput] = useState("1.0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    adminGetSurge(token)
      .then((d) => { setCurrent(d.surge_multiplier); setInput(String(d.surge_multiplier)); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    const val = parseFloat(input);
    if (isNaN(val)) { setError("Valeur invalide."); return; }
    setSaving(true); setError(null); setSuccess(false);
    try {
      const d = await adminSetSurge(token, val);
      setCurrent(d.surge_multiplier);
      setInput(String(d.surge_multiplier));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  const surgeColor = current >= 2 ? "#ef4444" : current >= 1.5 ? "#f59e0b" : "#4ade80";

  return (
    <div className="surge-panel">
      <div className="panel-header">
        <h2 className="panel-title">⚙️ Tarification dynamique</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>
      {loading && <div className="status loading">⏳ Chargement…</div>}
      {!loading && current !== null && (
        <div className="surge-current">
          <span className="surge-label">Multiplicateur actuel :</span>
          <span className="surge-value" style={{ color: surgeColor }}>×{current}</span>
          {current === 1.0 && <span className="surge-badge normal">Prix normal</span>}
          {current > 1.0 && current < 2.0 && <span className="surge-badge moderate">Modéré</span>}
          {current >= 2.0 && <span className="surge-badge high">Forte demande</span>}
        </div>
      )}
      <form className="surge-form" onSubmit={handleSave}>
        <label className="surge-form-label">
          Nouveau multiplicateur (1.0 – 5.0)
          <div className="surge-input-row">
            <input
              className="surge-input"
              type="number"
              step="0.1"
              min="1.0"
              max="5.0"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={saving}
            />
            <button className="surge-set-btn" type="submit" disabled={saving}>
              {saving ? "…" : "Appliquer"}
            </button>
          </div>
        </label>
        {error && <p className="form-error">{error}</p>}
        {success && <p className="surge-success">✓ Multiplicateur mis à jour</p>}
      </form>
      <div className="surge-hint">
        <p>1.0 = prix de base · 2.0 = prix doublé · max 5.0</p>
        <p>Prend effet immédiatement sur les prochaines estimations.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Applications Panel — Sprint 30
// ---------------------------------------------------------------------------

const APP_STATUS_LABELS = {
  submitted:    "📤 Soumise",
  under_review: "🔍 En révision",
  approved:     "✅ Approuvée",
  rejected:     "✗ Rejetée",
};

const APP_STATUS_FILTERS = [
  { value: "",            label: "Toutes" },
  { value: "submitted",   label: "Soumises" },
  { value: "under_review", label: "En révision" },
  { value: "approved",    label: "Approuvées" },
  { value: "rejected",    label: "Rejetées" },
];

const PAGE_SIZE_APPS = 10;

function ApplicationsPanel({ token }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [acting, setActing] = useState(null);
  const [noteInputs, setNoteInputs] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback((p = 0, sf = statusFilter) => {
    setPage(p); setLoading(true); setError(null);
    adminListApplications(token, sf || null, PAGE_SIZE_APPS, p * PAGE_SIZE_APPS)
      .then(setApps).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [token, statusFilter]);

  useEffect(() => { load(0, statusFilter); }, [statusFilter]); // eslint-disable-line

  async function handleReview(appId, newStatus) {
    const note = noteInputs[appId] || null;
    setActing(appId);
    try {
      const updated = await adminReviewApplication(token, appId, newStatus, note);
      setApps((prev) => prev.map((a) =>
        a.application_id === appId ? { ...a, status: updated.status, notes_admin: updated.notes_admin } : a
      ));
    } catch (e) { setError(e.message); }
    finally { setActing(null); }
  }

  return (
    <div className="applications-panel">
      <div className="panel-header">
        <h2 className="panel-title">📝 Candidatures chauffeur</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>

      {/* Status filter */}
      <div className="filter-bar">
        <select className="filter-select" value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}>
          {APP_STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <div className="status loading">⏳ Chargement…</div>}
      {!loading && apps.length === 0 && <p className="muted-msg">Aucune candidature.</p>}

      {apps.map((a) => (
        <div key={a.application_id} className={`application-row-admin application-row-${a.status}`}>
          <div className="application-admin-main">
            <span className={`application-admin-status application-admin-status-${a.status}`}>
              {APP_STATUS_LABELS[a.status] ?? a.status}
            </span>
            <span className="application-admin-name">{a.full_name}</span>
            <span className="application-admin-phone">{a.phone}</span>
          </div>
          <div className="application-admin-meta">
            <span>🚗 {a.vehicle_make} {a.vehicle_model} ({a.vehicle_year}) — {a.vehicle_plate}</span>
            <span>📦 {a.vehicle_category}</span>
            <span>{new Date(a.submitted_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
          {a.notes_admin && <p className="application-admin-note">💬 {a.notes_admin}</p>}
          {(a.status === "submitted" || a.status === "under_review") && (
            <div className="application-admin-actions">
              <input
                className="payout-note-input"
                type="text"
                placeholder="Note (optionnelle)"
                value={noteInputs[a.application_id] ?? ""}
                onChange={(e) => setNoteInputs((prev) => ({ ...prev, [a.application_id]: e.target.value }))}
              />
              {a.status === "submitted" && (
                <button
                  className="payout-approve-btn"
                  disabled={acting === a.application_id}
                  onClick={() => handleReview(a.application_id, "under_review")}
                >🔍 En révision</button>
              )}
              <button
                className="payout-approve-btn"
                disabled={acting === a.application_id}
                onClick={() => handleReview(a.application_id, "approved")}
              >✅ Approuver</button>
              <button
                className="payout-reject-btn"
                disabled={acting === a.application_id}
                onClick={() => handleReview(a.application_id, "rejected")}
              >✗ Rejeter</button>
            </div>
          )}
        </div>
      ))}

      {(apps.length === PAGE_SIZE_APPS || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Précédent</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={apps.length < PAGE_SIZE_APPS || loading}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LiveMapPanel — Sprint 31
// ---------------------------------------------------------------------------

function LiveMapPanel({ token }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    adminListLiveDrivers(token)
      .then(setDrivers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="live-map-panel">
      <div className="panel-header">
        <h2 className="panel-title">🗺️ Chauffeurs en ligne</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && <div className="status loading">⏳ Chargement…</div>}
      {!loading && drivers.length === 0 && (
        <p className="muted-msg">Aucun chauffeur en ligne actuellement.</p>
      )}
      {!loading && drivers.length > 0 && (
        <div className="live-drivers-count">
          <span className="live-badge">🟢 {drivers.length} chauffeur{drivers.length > 1 ? "s" : ""} en ligne</span>
        </div>
      )}
      <div className="live-drivers-table">
        {drivers.map((d) => (
          <div key={d.driver_id} className="live-driver-row">
            <div className="live-driver-main">
              <span className="live-driver-name">🧑‍✈️ {d.email}</span>
              <span className="live-driver-status online">🟢 En ligne</span>
            </div>
            <div className="live-driver-meta">
              {d.lat != null && d.lng != null ? (
                <span className="live-driver-coords">📍 {d.lat.toFixed(4)}, {d.lng.toFixed(4)}</span>
              ) : (
                <span className="live-driver-coords muted">📍 Position inconnue</span>
              )}
              {d.heading != null && (
                <span className="live-driver-heading">🧭 {d.heading}°</span>
              )}
              {d.last_updated && (
                <span className="live-driver-time">
                  ⏱️ {new Date(d.last_updated).toLocaleTimeString("fr-FR")}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="muted-msg" style={{ marginTop: "12px", fontSize: ".8rem" }}>
        Actualisation automatique toutes les 30 secondes.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FlagsPanel — Sprint 31
// ---------------------------------------------------------------------------

function FlagsPanel({ token }) {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);
  const [saveError, setSaveError] = useState(null);
  // Invite code creation
  const [newCode, setNewCode] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [creatingCode, setCreatingCode] = useState(false);
  const [codeResult, setCodeResult] = useState(null);
  const [codeError, setCodeError] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    adminListFlags(token)
      .then(setFlags)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(flag) {
    setSaving(flag.name); setSaveError(null);
    try {
      const updated = await adminSetFlag(token, flag.name, { enabled: !flag.enabled });
      setFlags((prev) => prev.map((f) => f.name === flag.name ? updated : f));
    } catch (e) { setSaveError(e.message); }
    finally { setSaving(null); }
  }

  async function handleRollout(flag, newPct) {
    const pct = parseInt(newPct, 10);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    setSaving(flag.name); setSaveError(null);
    try {
      const updated = await adminSetFlag(token, flag.name, { rollout_pct: pct });
      setFlags((prev) => prev.map((f) => f.name === flag.name ? updated : f));
    } catch (e) { setSaveError(e.message); }
    finally { setSaving(null); }
  }

  async function handleCreateCode(e) {
    e.preventDefault();
    if (!newCode.trim()) return;
    setCreatingCode(true); setCodeError(null); setCodeResult(null);
    try {
      const result = await adminCreateInviteCode(token, newCode.trim(), maxUses);
      setCodeResult(result);
      setNewCode(""); setMaxUses(1);
    } catch (err) { setCodeError(err.message); }
    finally { setCreatingCode(false); }
  }

  return (
    <div className="flags-panel">
      <div className="panel-header">
        <h2 className="panel-title">🚩 Feature Flags</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {saveError && <p className="form-error">{saveError}</p>}
      {loading && <div className="status loading">⏳ Chargement…</div>}

      {!loading && flags.length === 0 && <p className="muted-msg">Aucun flag configuré.</p>}

      <div className="flags-grid">
        {flags.map((flag) => (
          <div key={flag.name} className={`flag-row ${flag.enabled ? "flag-enabled" : "flag-disabled"}`}>
            <div className="flag-main">
              <span className="flag-name">{flag.name}</span>
              {flag.description && <span className="flag-desc">{flag.description}</span>}
            </div>
            <div className="flag-controls">
              <button
                className={`flag-toggle ${flag.enabled ? "flag-toggle-on" : "flag-toggle-off"}`}
                disabled={saving === flag.name}
                onClick={() => handleToggle(flag)}
                title={flag.enabled ? "Désactiver" : "Activer"}
              >
                {flag.enabled ? "✅ Activé" : "⛔ Désactivé"}
              </button>
              <div className="flag-rollout">
                <label className="flag-rollout-label">Rollout</label>
                <input
                  type="number"
                  className="flag-rollout-input"
                  min="0" max="100"
                  value={flag.rollout_pct}
                  disabled={saving === flag.name}
                  onChange={(e) => handleRollout(flag, e.target.value)}
                />
                <span>%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Invite Codes */}
      <div className="invite-code-section">
        <h3 className="section-subtitle">🎟️ Codes d'invitation</h3>
        <form className="invite-code-form" onSubmit={handleCreateCode}>
          <input
            type="text"
            className="invite-code-input"
            placeholder="Code (ex: BETA-LAUNCH-001)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            required
          />
          <label>Max utilisations</label>
          <input
            type="number"
            className="invite-uses-input"
            min="1" max="1000"
            value={maxUses}
            onChange={(e) => setMaxUses(parseInt(e.target.value, 10) || 1)}
          />
          <button type="submit" className="batch-run-btn" disabled={creatingCode}>
            {creatingCode ? "Création…" : "Créer le code"}
          </button>
        </form>
        {codeError && <p className="form-error">{codeError}</p>}
        {codeResult && (
          <div className="batch-result">
            <p className="batch-result-row">✅ Code créé : <strong>{codeResult.code}</strong></p>
            <p className="batch-result-row">Max utilisations : {codeResult.max_uses}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CitiesPanel — Sprint 32
// ---------------------------------------------------------------------------

const COUNTRY_DEFAULT = "Côte d'Ivoire";

function CitiesPanel({ token }) {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [form, setForm] = useState({
    name: "", country: COUNTRY_DEFAULT,
    center_lat: "", center_lng: "", radius_km: "30", active: true,
  });

  const load = useCallback(() => {
    setLoading(true); setError(null);
    adminListCities(token)
      .then(setCities)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true); setSaveError(null);
    try {
      const created = await adminCreateCity(token, {
        name: form.name.trim(),
        country: form.country,
        center_lat: parseFloat(form.center_lat),
        center_lng: parseFloat(form.center_lng),
        radius_km: parseFloat(form.radius_km),
        active: form.active,
      });
      setCities((prev) => [...prev, created]);
      setShowForm(false);
      setForm({ name: "", country: COUNTRY_DEFAULT, center_lat: "", center_lng: "", radius_km: "30", active: true });
    } catch (err) { setSaveError(err.message); }
    finally { setSaving(false); }
  }

  async function handleToggleActive(city) {
    try {
      const updated = await adminUpdateCity(token, city.city_id, { active: !city.active });
      setCities((prev) => prev.map((c) => c.city_id === city.city_id ? updated : c));
    } catch (err) { setError(err.message); }
  }

  const STATUS_COLOR = { true: "#16a34a", false: "#94a3b8" };

  return (
    <div className="cities-panel">
      <div className="panel-header">
        <h2 className="panel-title">🌍 Villes desservies</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
          <button className="batch-run-btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "✕ Annuler" : "+ Nouvelle ville"}
          </button>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <div className="status loading">⏳ Chargement…</div>}

      {showForm && (
        <form className="city-form" onSubmit={handleCreate}>
          <h3 className="section-subtitle">Ajouter une ville</h3>
          {saveError && <p className="form-error">{saveError}</p>}
          <div className="city-form-grid">
            <label>Nom
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Abidjan" />
            </label>
            <label>Pays
              <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </label>
            <label>Latitude centre
              <input type="number" step="any" required value={form.center_lat} onChange={(e) => setForm({ ...form, center_lat: e.target.value })} placeholder="5.3364" />
            </label>
            <label>Longitude centre
              <input type="number" step="any" required value={form.center_lng} onChange={(e) => setForm({ ...form, center_lng: e.target.value })} placeholder="-4.0267" />
            </label>
            <label>Rayon (km)
              <input type="number" step="1" min="1" value={form.radius_km} onChange={(e) => setForm({ ...form, radius_km: e.target.value })} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active
            </label>
          </div>
          <button type="submit" className="batch-run-btn" disabled={saving}>
            {saving ? "Création…" : "Créer la ville"}
          </button>
        </form>
      )}

      <div className="cities-grid">
        {cities.map((city) => (
          <div key={city.city_id} className={`city-row ${city.active ? "city-active" : "city-inactive"}`}>
            <div className="city-main">
              <span className="city-name">🌍 {city.name}</span>
              <span className="city-country">{city.country}</span>
            </div>
            <div className="city-meta">
              <span>📍 {city.center_lat.toFixed(4)}, {city.center_lng.toFixed(4)}</span>
              <span>📏 {city.radius_km} km</span>
            </div>
            <div className="city-footer-row">
              <span style={{ color: STATUS_COLOR[city.active], fontWeight: 600 }}>
                {city.active ? "🟢 Active" : "⚪ Inactive"}
              </span>
              <button
                className={city.active ? "payout-reject-btn" : "payout-approve-btn"}
                style={{ fontSize: ".8rem", padding: "4px 10px" }}
                onClick={() => handleToggleActive(city)}
              >
                {city.active ? "Désactiver" : "Activer"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnalyticsPanel — Sprint 34
// ---------------------------------------------------------------------------

function KPICard({ label, value, unit = "", icon = "📊" }) {
  return (
    <div className="kpi-card">
      <span className="kpi-icon">{icon}</span>
      <span className="kpi-value">{typeof value === "number" ? value.toLocaleString("fr-FR") : value}{unit}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}

function AnalyticsPanel({ token }) {
  const [kpis, setKpis] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [driverPerf, setDriverPerf] = useState([]);
  const [categories, setCategories] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revPeriod, setRevPeriod] = useState("day");

  const loadRevenue = useCallback((period) => {
    adminGetRevenue(token, period, 14)
      .then(setRevenue)
      .catch(() => {});
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [k, dp, cat, hr, tc] = await Promise.all([
        adminGetKPIs(token),
        adminGetDriverPerformance(token, 10),
        adminGetCategoryBreakdown(token),
        adminGetHourlyDemand(token),
        adminGetTopCustomers(token, 8),
      ]);
      setKpis(k); setDriverPerf(dp); setCategories(cat); setHourly(hr); setTopCustomers(tc);
      loadRevenue(revPeriod);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, revPeriod, loadRevenue]);

  useEffect(() => { load(); }, [load]);

  const maxHourly = Math.max(...hourly.map((h) => h.trip_count), 1);

  return (
    <div className="analytics-panel">
      <div className="panel-header">
        <h2 className="panel-title">📈 Analytics avancées</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && <div className="status loading">⏳ Chargement des analytics…</div>}

      {kpis && (
        <div className="kpi-grid">
          <KPICard icon="👥" label="Utilisateurs" value={kpis.total_users} />
          <KPICard icon="🧑‍✈️" label="Chauffeurs" value={kpis.total_drivers} />
          <KPICard icon="🟢" label="En ligne" value={kpis.online_drivers} />
          <KPICard icon="🚕" label="Courses totales" value={kpis.total_trips} />
          <KPICard icon="✅" label="Taux complétion" value={kpis.completion_rate_pct} unit="%" />
          <KPICard icon="💰" label="Revenu total" value={Math.round(kpis.total_revenue_xof).toLocaleString("fr-FR")} unit=" XOF" />
          <KPICard icon="⭐" label="Note moyenne" value={kpis.avg_rating} />
        </div>
      )}

      {/* Revenue chart (text-based sparkline) */}
      <div className="analytics-section">
        <div className="analytics-section-header">
          <h3 className="analytics-subtitle">💰 Revenu par période</h3>
          <div className="period-tabs">
            {["day", "week", "month"].map((p) => (
              <button
                key={p}
                className={`period-tab ${revPeriod === p ? "active" : ""}`}
                onClick={() => { setRevPeriod(p); loadRevenue(p); }}
              >{p === "day" ? "Jour" : p === "week" ? "Semaine" : "Mois"}</button>
            ))}
          </div>
        </div>
        {revenue.length === 0 && <p className="muted-msg">Aucune donnée de revenu.</p>}
        {revenue.map((r) => (
          <div key={r.period} className="analytics-bar-row">
            <span className="analytics-bar-label">{r.period}</span>
            <span className="analytics-bar-trips">{r.trip_count} courses</span>
            <span className="analytics-bar-revenue">{r.revenue_xof.toLocaleString("fr-FR")} XOF</span>
          </div>
        ))}
      </div>

      {/* Category breakdown */}
      <div className="analytics-section">
        <h3 className="analytics-subtitle">🚗 Répartition par catégorie</h3>
        {categories.length === 0 && <p className="muted-msg">Aucune donnée.</p>}
        {categories.map((c) => (
          <div key={c.category} className="analytics-bar-row">
            <span className="analytics-bar-label" style={{ textTransform: "capitalize" }}>{c.category}</span>
            <span className="analytics-bar-trips">{c.trip_count} courses</span>
            <span className="analytics-bar-revenue">moy. {c.avg_fare_xof.toLocaleString("fr-FR")} XOF</span>
          </div>
        ))}
      </div>

      {/* Hourly demand (mini bar chart) */}
      <div className="analytics-section">
        <h3 className="analytics-subtitle">⏰ Demande par heure</h3>
        <div className="hourly-chart">
          {hourly.map((h) => (
            <div key={h.hour} className="hourly-bar-col">
              <div
                className="hourly-bar"
                style={{ height: `${Math.round((h.trip_count / maxHourly) * 60)}px` }}
                title={`${h.hour}h: ${h.trip_count} courses`}
              />
              <span className="hourly-label">{h.hour}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top customers */}
      {topCustomers.length > 0 && (
        <div className="analytics-section">
          <h3 className="analytics-subtitle">👑 Top clients</h3>
          {topCustomers.map((c, i) => (
            <div key={c.user_id} className="analytics-bar-row">
              <span className="analytics-rank">#{i + 1}</span>
              <span className="analytics-bar-label">{c.email}</span>
              <span className="analytics-bar-trips">{c.trip_count} courses</span>
              <span className="analytics-bar-revenue">{c.total_spent_xof.toLocaleString("fr-FR")} XOF</span>
            </div>
          ))}
        </div>
      )}

      {/* Driver performance */}
      {driverPerf.length > 0 && (
        <div className="analytics-section">
          <h3 className="analytics-subtitle">🏆 Performance chauffeurs</h3>
          {driverPerf.map((d, i) => (
            <div key={d.driver_id} className="analytics-bar-row">
              <span className="analytics-rank">#{i + 1}</span>
              <span className="analytics-bar-label">{d.email}</span>
              <span className="analytics-bar-trips">{d.trip_count} courses</span>
              <span className="analytics-bar-rating">⭐ {d.avg_rating}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard — tabbed navigation
// ---------------------------------------------------------------------------

const TABS = [
  { id: "stats",        label: "📊 Stats" },
  { id: "trips",        label: "🚕 Courses" },
  { id: "assist",       label: "🆘 Assistances" },
  { id: "drivers",      label: "🧑‍✈️ Chauffeurs" },
  { id: "live",         label: "🗺️ Live" },
  { id: "cities",       label: "🌍 Villes" },
  { id: "analytics",    label: "📈 Analytics" },
  { id: "promos",       label: "🏷️ Promos" },
  { id: "payouts",      label: "💸 Retraits",    pendingKey: "payout_requests" },
  { id: "ratings",      label: "⭐ Avis" },
  { id: "documents",    label: "📄 Documents",   pendingKey: "documents" },
  { id: "commission",   label: "💰 Commission" },
  { id: "applications", label: "📝 Candidatures" },
  { id: "flags",        label: "🚩 Feature Flags" },
  { id: "settings",     label: "⚙️ Paramètres" },
  { id: "users",        label: "👥 Utilisateurs" },
];

function Dashboard({ user, token, onLogout }) {
  const [activeTab, setActiveTab] = useState("stats");
  const [pendingCounts, setPendingCounts] = useState({ payout_requests: 0, documents: 0 });

  const loadPending = useCallback(() => {
    adminGetPendingCounts(token)
      .then(setPendingCounts)
      .catch(() => {});
  }, [token]);

  useEffect(() => { loadPending(); }, [loadPending]);
  // Refresh pending counts whenever tab changes (so badge is up to date)
  useEffect(() => { loadPending(); }, [activeTab, loadPending]);

  return (
    <div className="app admin-app">
      <header className="dash-header">
        <h1>Ziza Admin</h1>
        <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
      </header>
      <div className="status ok">✓ Connecté — <strong>{user.email}</strong></div>
      <div className="role-badge">{user.role} · {user.provider}</div>

      <div className="admin-tabs">
        {TABS.map((t) => {
          const count = t.pendingKey ? pendingCounts[t.pendingKey] : 0;
          return (
            <button key={t.id} className={`admin-tab ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
              {count > 0 && <span className="tab-badge">{count}</span>}
            </button>
          );
        })}
      </div>

      {activeTab === "stats"      && <StatsPanel       token={token} />}
      {activeTab === "trips"      && <TripsPanel       token={token} />}
      {activeTab === "assist"     && <AssistancePanel  token={token} />}
      {activeTab === "drivers"    && <DriversPanel     token={token} />}
      {activeTab === "promos"     && <PromoPanel       token={token} />}
      {activeTab === "payouts"    && <PayoutsPanel     token={token} />}
      {activeTab === "ratings"    && <RatingsPanel     token={token} />}
      {activeTab === "documents"  && <DocumentsPanel   token={token} />}
      {activeTab === "commission"   && <CommissionPanel    token={token} />}
      {activeTab === "applications" && <ApplicationsPanel  token={token} />}
      {activeTab === "live"         && <LiveMapPanel        token={token} />}
      {activeTab === "cities"       && <CitiesPanel          token={token} />}
      {activeTab === "analytics"    && <AnalyticsPanel       token={token} />}
      {activeTab === "flags"        && <FlagsPanel          token={token} />}
      {activeTab === "settings"     && <SurgePanel          token={token} />}
      {activeTab === "users"        && <UsersPanel          token={token} />}

      <p className="footer">App: <strong>web-admin</strong> · Sprint 34</p>
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
