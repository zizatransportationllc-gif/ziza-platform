import { useEffect, useState, useCallback } from "react";
import {
  login, signup, exchangeFirebaseToken, fetchMe, registerUser,
  adminListDrivers, adminSetDriverCapabilities,
  adminGetStats, adminListTrips, adminListUsers,
  adminCreatePromo, adminListPromos, adminDeactivatePromo, adminSetDriverStatus,
  adminListPayouts, adminUpdatePayoutStatus, adminListRatings,
  adminGetSurge, adminSetSurge,
  adminGetPricing, adminSetPricing, // configurable fare formula
  adminListDocuments, adminUpdateDocumentStatus, adminGetPendingCounts,
  getCommissionSettings, setCommission, runPayoutBatch, // Sprint 29
  adminListApplications, adminReviewApplication, // Sprint 30
  adminListFlags, adminSetFlag, // Sprint 31
  adminListLiveDrivers, adminSetUserRole, adminCreateInviteCode, // Sprint 31
  adminListCities, adminCreateCity, adminUpdateCity, adminDeleteCity, adminSeedDefaultCities, // Sprint 32 / 45 / 46
  adminListServiceZones, adminCreateServiceZone, adminUpdateServiceZone, adminDeleteServiceZone, // Sprint 45
  adminGetKPIs, adminGetRevenue, adminGetDriverPerformance, // Sprint 34
  adminGetCategoryBreakdown, adminGetHourlyDemand, adminGetTopCustomers, // Sprint 34
  adminGetServices, adminSetService, // Sprint 36
  adminListCraftRequests, adminListProfessionals, adminListBidsForRequest, // Sprint 47
  adminListOnboarding, adminGetOnboardingDetail, // Sprint 57
  adminGetDriverHistory, adminGetDriverEarnings, adminGetProfessionalSummary, // Sprint 66
  adminListTripMessages, adminListRequestMessages, // Sprint 66 — read conversations
  adminFinanceMetrics, adminFinanceAlerts, adminFinanceTransactions, // WS6 — finance
  adminSetProfessionalStatus, // Sprint 54 (used in Sprint 57 review panel)
} from "./api";
import { firebaseEnabled, signInWithGoogle, signUpEmail, signInEmail, firebaseSignOut } from "./auth";
import LiveMap from "./LiveMap";

const REQUIRED_ROLE = "admin";
const TOKEN_KEY = "ziza_token";

const STATUS_LABELS = {
  pending:     "Pending",
  accepted:    "Accepted",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
  resolved:    "Resolved",
};

function formatUSD(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
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

function LoginForm({ onEmailLogin, onGoogleLogin, onSignup, error, loading }) {
  const [tab, setTab] = useState("signin");
  // Sign-in fields
  const [email, setEmail] = useState("admin@ziza.dev");
  const [password, setPassword] = useState("ziza2024");
  // Sign-up fields
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suName, setSuName] = useState("");
  const [suCode, setSuCode] = useState("");
  const [suError, setSuError] = useState(null);

  function handleSignup(e) {
    e.preventDefault();
    setSuError(null);
    if (suPassword !== suConfirm) { setSuError("Passwords do not match"); return; }
    if (suPassword.length < 6) { setSuError("Password must be at least 6 characters"); return; }
    if (!suCode.trim()) { setSuError("Admin registration code is required"); return; }
    onSignup(suEmail, suPassword, suName, suCode);
  }

  return (
    <div className="app">
      <h1>Ziza Admin</h1>
      <p className="subtitle">Sprint 65 — Identity Fields</p>
      <div className="auth-tabs">
        <button className={`auth-tab${tab === "signin" ? " active" : ""}`} onClick={() => setTab("signin")}>Sign In</button>
        <button className={`auth-tab${tab === "signup" ? " active" : ""}`} onClick={() => setTab("signup")}>Create Admin Account</button>
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
          {error && <p className="form-error">{error}</p>}
          <p className="hint">Demo: admin@ziza.dev / ziza2024</p>
        </>
      ) : (
        <>
          <form className="login-form" onSubmit={handleSignup}>
            <input type="email" value={suEmail} onChange={(e) => setSuEmail(e.target.value)} placeholder="Email address" required />
            <PasswordInput value={suPassword} onChange={(e) => setSuPassword(e.target.value)} placeholder="Password (min. 6 characters)" required />
            <PasswordInput value={suConfirm} onChange={(e) => setSuConfirm(e.target.value)} placeholder="Confirm password" required />
            <input type="text" value={suName} onChange={(e) => setSuName(e.target.value)} placeholder="Full name (optional)" />
            <input type="text" value={suCode} onChange={(e) => setSuCode(e.target.value)} placeholder="Admin registration code" required />
            <button type="submit" disabled={loading}>{loading ? "Creating account…" : "Create Admin Account"}</button>
          </form>
          {(suError || error) && <p className="form-error">{suError || error}</p>}
          <p className="hint">Admin accounts require a registration code issued by the platform team.</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents Panel — Sprint 17
// ---------------------------------------------------------------------------

const DOC_TYPE_LABELS = {
  license:      "🪪 Driver's License",
  insurance:    "📋 Vehicle Insurance",
  registration: "📄 Vehicle Registration",
  id_card:      "🪪 Government ID",
};

const DOC_STATUS_LABELS = {
  pending:              "⏳ Pending",
  approved:             "✅ Approved",
  rejected:             "✗ Rejected",
  needs_resubmission:   "🔄 Redo",
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
        <h2 className="panel-title">📄 KYC Documents</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && <div className="status loading">⏳ Loading…</div>}
      {!loading && docs.length === 0 && <p className="muted-msg">No documents submitted.</p>}
      {docs.map((d) => (
        <div key={d.document_id} className={`doc-admin-row doc-admin-${d.status}`}>
          <div className="doc-admin-main">
            <span className="doc-admin-type">{DOC_TYPE_LABELS[d.type] ?? d.type}</span>
            {/* Sprint 54 — show owner type */}
            <span className={`doc-owner-badge doc-owner-${d.owner_type ?? "driver"}`}>
              {d.owner_type === "professional" ? "🔧 Pro" : "🚗 Driver"}
            </span>
            <span className={`doc-admin-status doc-admin-status-${d.status}`}>
              {DOC_STATUS_LABELS[d.status] ?? d.status}
            </span>
          </div>
          <div className="doc-admin-meta">
            <span>{d.owner_type === "professional" ? "🔧" : "🧑‍✈️"} {d.driver_email}</span>
            <a className="doc-admin-url" href={d.url.startsWith("data:") ? "#" : d.url} target="_blank" rel="noreferrer">
              {d.url.startsWith("data:") ? "Base64 image" : "View document ↗"}
            </a>
            <span>{new Date(d.created_at).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
          {d.note_admin && <p className="doc-admin-note">💬 {d.note_admin}</p>}
          {d.status === "pending" && (
            <div className="doc-admin-actions">
              <input
                className="payout-note-input"
                type="text"
                placeholder="Note (optional)"
                value={noteInputs[d.document_id] ?? ""}
                onChange={(e) => setNoteInputs((prev) => ({ ...prev, [d.document_id]: e.target.value }))}
              />
              <button
                className="payout-approve-btn"
                disabled={acting === d.document_id}
                onClick={() => handleStatus(d.document_id, "approved")}
              >✅ Approve</button>
              <button
                className="payout-reject-btn"
                disabled={acting === d.document_id}
                onClick={() => handleStatus(d.document_id, "rejected")}
              >✗ Reject</button>
            </div>
          )}
        </div>
      ))}
      {(docs.length === PAGE_SIZE_DOCS || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={docs.length < PAGE_SIZE_DOCS || loading}>Next →</button>
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

  if (loading && !stats) return <div className="status loading">⏳ Loading statistics…</div>;
  if (error) return <p className="form-error">{error}</p>;
  if (!stats) return null;

  const { trips, drivers, payments } = stats;

  return (
    <div className="stats-panel">
      <div className="panel-header">
        <h2 className="panel-title">Overview</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>
      <div className="stats-grid">
        <StatCard
          label="Total Trips"
          value={trips.total}
          sub={`${trips.by_status?.completed ?? 0} completed · ${trips.by_status?.pending ?? 0} pending`}
        />
        <StatCard
          label="Revenue"
          value={formatUSD(trips.total_revenue_cents)}
          sub="Completed trips"
        />
        <StatCard
          label="Drivers"
          value={drivers.total}
          sub={`${drivers.by_status?.active ?? 0} active`}
        />
        {payments && (
          <StatCard
            label="💳 Confirmed Payments"
            value={payments.total_paid}
            sub={formatUSD(payments.total_paid_cents)}
          />
        )}
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
        {trip.fare_cents && <span className="trip-fare">{formatUSD(trip.fare_cents)}</span>}
        {trip.paid_at && (
          <span className="trip-paid-badge">💳 Paid</span>
        )}
      </div>
      <div className="trip-row-meta">
        {trip.distance_km != null && <span>🛣️ {fmtMiles(trip.distance_km)} mi</span>}
        {trip.duration_min != null && <span>⏱️ {trip.duration_min} min</span>}
        <span className="trip-date">{new Date(trip.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trip filter bar — Sprint 19
// ---------------------------------------------------------------------------

const TRIP_STATUSES = [
  { value: "",            label: "All statuses" },
  { value: "pending",     label: "Pending" },
  { value: "accepted",    label: "Accepted" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
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
        placeholder="Customer email…"
        value={filters.customerEmail}
        onChange={(e) => onChange("customerEmail", e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSearch()}
      />
      <input
        className="filter-input filter-date"
        type="date"
        value={filters.dateFrom}
        onChange={(e) => onChange("dateFrom", e.target.value)}
        title="Start date"
      />
      <input
        className="filter-input filter-date"
        type="date"
        value={filters.dateTo}
        onChange={(e) => onChange("dateTo", e.target.value)}
        title="End date"
      />
      <button className="filter-search-btn" onClick={onSearch} disabled={loading}>🔍</button>
      <button className="filter-reset-btn" onClick={onReset} disabled={loading} title="Reset">✕</button>
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
        <h2 className="panel-title">All Trips</h2>
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
        <div className="empty-state">No trips recorded.</div>
      )}
      <div className="trip-list-admin">
        {trips.map((t) => <TripRow key={t.trip_id} trip={t} />)}
      </div>
      {(trips.length === PAGE_SIZE || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={trips.length < PAGE_SIZE || loading}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Driver row
// ---------------------------------------------------------------------------

function DriverRow({ driver, onStatusChange, onViewDocs }) {
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
          <button
            className="view-docs-btn"
            onClick={onViewDocs}
            title="View full profile and documents"
          >
            👁 View Docs
          </button>
          {/* Sprint 54 — activate pending_docs drivers */}
          {driver.status === "pending_docs" && (
            <button
              className="activate-btn"
              onClick={() => handleStatus("active")}
              disabled={changingStatus}
              title="Activate driver (docs validated)"
            >
              ✅ Activate
            </button>
          )}
          {driver.status !== "suspended" && driver.status !== "pending_docs" ? (
            <button
              className="suspend-btn"
              onClick={() => handleStatus("suspended")}
              disabled={changingStatus}
              title="Suspend this driver"
            >
              🚫
            </button>
          ) : driver.status === "suspended" ? (
            <button
              className="activate-btn"
              onClick={() => handleStatus("active")}
              disabled={changingStatus}
              title="Reactivate this driver"
            >
              ✅
            </button>
          ) : null}
        </div>
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
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setDrivers(await adminListDrivers(token)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(driverId, newStatus) {
    try {
      const result = await adminSetDriverStatus(token, driverId, newStatus);
      setDrivers((prev) => prev.map((d) =>
        d.driver_id === driverId ? { ...d, status: result.status } : d
      ));
    } catch (e) { setError(e.message); }
  }

  // Sprint 60 — show full profile + docs for selected driver
  if (selectedId) {
    return (
      <UserReviewPanel
        token={token}
        entityId={selectedId}
        entityType="driver"
        onBack={() => { setSelectedId(null); load(); }}
      />
    );
  }

  return (
    <div className="drivers-panel">
      <div className="panel-header">
        <h2 className="panel-title">Registered Drivers</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>{loading ? "…" : "↻ Refresh"}</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!loading && drivers.length === 0 && <div className="empty-state">No drivers registered.</div>}
      <div className="driver-list">
        {drivers.map((d) => (
          <DriverRow
            key={d.driver_id}
            driver={d}
            onStatusChange={handleStatusChange}
            onViewDocs={() => setSelectedId(d.driver_id)}
          />
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
  const displayName = (u.first_name || u.last_name)
    ? [u.first_name, u.last_name].filter(Boolean).join(" ")
    : (u.name || null);
  return (
    <div className="user-row">
      <div className="user-row-main">
        <span className={`user-role-badge ${ROLE_COLORS[u.role] ?? ""}`}>{u.role}</span>
        <span className="user-email">{u.email}</span>
        {displayName && (
          <span style={{ fontSize: 13, color: "var(--color-fg)", fontWeight: 500 }}>{displayName}</span>
        )}
      </div>
      <div className="user-row-meta">
        {u.date_of_birth && <span>🎂 {u.date_of_birth}</span>}
        {u.phone && <span>📞 {u.phone}</span>}
        <span className="user-provider">{u.provider}</span>
        <span className="user-date">{new Date(u.created_at).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User filter bar — Sprint 19
// ---------------------------------------------------------------------------

const USER_ROLES = [
  { value: "",             label: "All roles" },
  { value: "admin",        label: "Admin" },
  { value: "driver",       label: "Driver" },
  { value: "customer",     label: "Customer" },
  { value: "professional", label: "Professional" },
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
        <h2 className="panel-title">Registered Users</h2>
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
        <button className="filter-reset-btn" onClick={handleReset} disabled={loading} title="Reset">✕</button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {!loading && users.length === 0 && <div className="empty-state">No users registered.</div>}
      <div className="user-list">
        {users.map((u) => <UserRow key={u.user_id} u={u} />)}
      </div>
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
        <h2 className="panel-title">Promo Codes</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>

      {/* Create form */}
      <form className="promo-create-form" onSubmit={handleCreate}>
        <div className="promo-form-row">
          <input
            className="promo-code-input"
            placeholder="Code (e.g. ZIZA10)"
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
            placeholder="% discount"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            required
          />
          <input
            className="promo-max-input"
            type="number"
            min="1"
            placeholder="Max uses"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
          <button type="submit" className="cap-save-btn" disabled={creating}>
            {creating ? "…" : "✚ Create"}
          </button>
        </div>
        {createError && <p className="form-error">{createError}</p>}
      </form>

      {error && <p className="form-error">{error}</p>}
      {!loading && promos.length === 0 && (
        <div className="empty-state">No promo codes created.</div>
      )}
      <div className="promo-list">
        {promos.map((p) => (
          <div key={p.promo_id} className={`promo-row ${p.active ? "" : "promo-inactive"}`}>
            <div className="promo-row-main">
              <span className="promo-code-badge">{p.code}</span>
              <span className="promo-pct">-{p.discount_pct}%</span>
              <span className={`promo-status ${p.active ? "active" : "inactive"}`}>
                {p.active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="promo-row-meta">
              <span>{p.uses} use{p.uses !== 1 ? "s" : ""}{p.max_uses ? ` / ${p.max_uses}` : ""}</span>
              {p.expires_at && <span>Expires: {new Date(p.expires_at).toLocaleDateString("en-US")}</span>}
            </div>
            {p.active && (
              <button className="promo-deactivate-btn" onClick={() => handleDeactivate(p.code)}>
                Deactivate
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
  pending:  "⏳ Pending",
  approved: "✅ Approved",
  rejected: "✗ Rejected",
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
        <h2 className="panel-title">💸 Payout Requests</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>
      {loading && <div className="status loading">⏳ Loading…</div>}
      {!loading && payouts.length === 0 && <p className="muted-msg">No payout requests.</p>}
      {payouts.map((p) => (
        <div key={p.payout_id} className={`payout-row payout-row-${p.status}`}>
          <div className="payout-row-main">
            <span className="payout-row-amount">{formatUSD(p.amount_cents)}</span>
            <span className={`payout-row-status status-${p.status}`}>
              {PAYOUT_STATUS_LABELS[p.status] ?? p.status}
            </span>
          </div>
          <div className="payout-row-meta">
            <span>🧑‍✈️ {p.driver_email}</span>
            <span>{new Date(p.created_at).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
          {p.note_admin && <p className="payout-row-note">💬 {p.note_admin}</p>}
          {p.status === "pending" && (
            <div className="payout-row-actions">
              <input
                className="payout-note-input"
                type="text"
                placeholder="Note (optional)"
                value={noteInputs[p.payout_id] ?? ""}
                onChange={(e) => setNoteInputs((prev) => ({ ...prev, [p.payout_id]: e.target.value }))}
              />
              <button
                className="payout-approve-btn"
                disabled={acting === p.payout_id}
                onClick={() => handleStatus(p.payout_id, "approved")}
              >✅ Approve</button>
              <button
                className="payout-reject-btn"
                disabled={acting === p.payout_id}
                onClick={() => handleStatus(p.payout_id, "rejected")}
              >✗ Reject</button>
            </div>
          )}
        </div>
      ))}
      {(payouts.length === PAGE_SIZE_PAYOUT || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={payouts.length < PAGE_SIZE_PAYOUT || loading}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commission Panel — Sprint 29
// ---------------------------------------------------------------------------

const COMMISSION_CATEGORY_LABELS = {
  economy: "🚗 Economy",
  comfort: "🚙 Comfort",
  premium: "🏎️ Premium",
  default: "📦 Default",
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
      setSaveError("Rate must be between 0 and 100."); return;
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

  const CATS = ["economy", "comfort", "premium", "default"];

  return (
    <div className="commission-panel">
      <div className="panel-header">
        <h2 className="panel-title">💰 Commission &amp; Batch Payout</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>

      {/* Commission rates table */}
      <section className="commission-section">
        <h3 className="commission-section-title">Commission rates by category</h3>
        {error && <p className="form-error">{error}</p>}
        {loading && <div className="status loading">⏳ Loading…</div>}
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
                    Edit
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
                {COMMISSION_CATEGORY_LABELS[editing.category]} — rate (%)
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
                {saving ? "…" : "✓ Save"}
              </button>
              <button
                className="cap-cancel-btn"
                type="button"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
            {saveError && <p className="form-error">{saveError}</p>}
          </form>
        )}
        {saveSuccess && <p className="surge-success">✓ Rate updated successfully</p>}
      </section>

      {/* Batch payout section */}
      <section className="commission-section batch-section">
        <h3 className="commission-section-title">Batch Payout</h3>
        <p className="commission-hint">
          Processes all approved payout requests.
          Already-processed requests are ignored (idempotent).
        </p>
        <button
          className="batch-run-btn"
          onClick={handleBatch}
          disabled={batching}
        >
          {batching ? "⏳ Processing…" : "🚀 Run Batch Payout"}
        </button>

        {batchError && <p className="form-error">✗ {batchError}</p>}
        {batchResult && (
          <div className="batch-result">
            <div className="batch-result-row">
              <span className="batch-result-label">✅ Processed</span>
              <span className="batch-result-value">{batchResult.processed}</span>
            </div>
            <div className="batch-result-row">
              <span className="batch-result-label">✗ Failed</span>
              <span className="batch-result-value">{batchResult.failed}</span>
            </div>
            <div className="batch-result-row">
              <span className="batch-result-label">Total net amount</span>
              <span className="batch-result-value">{formatUSD(batchResult.total_net_cents)}</span>
            </div>
            <div className="batch-result-row">
              <span className="batch-result-label">Total commission</span>
              <span className="batch-result-value">{formatUSD(batchResult.total_commission_cents)}</span>
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
        <h2 className="panel-title">⭐ Customer Reviews</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>
      {loading && <div className="status loading">⏳ Loading…</div>}
      {!loading && ratings.length === 0 && <p className="muted-msg">No reviews yet.</p>}
      {ratings.map((r) => (
        <div key={r.rating_id} className="rating-row">
          <div className="rating-row-main">
            <StarDisplay stars={r.stars} />
            <span className="rating-customer">{r.customer_email}</span>
          </div>
          {r.comment && <p className="rating-comment">&ldquo;{r.comment}&rdquo;</p>}
          <div className="rating-row-meta">
            <span>🧑‍✈️ Driver {r.driver_id.slice(0, 8)}…</span>
            <span>{new Date(r.created_at).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
        </div>
      ))}
      {(ratings.length === PAGE_SIZE_RATINGS || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={ratings.length < PAGE_SIZE_RATINGS || loading}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surge Pricing Panel — Sprint 16
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fare Formula Panel — admin-configurable pricing coefficients
// ---------------------------------------------------------------------------

function _pricingForm(d) {
  return {
    base: (d.base_fare_cents / 100).toFixed(2),
    perMile: (d.per_mile_cents / 100).toFixed(2),
    perMinute: (d.per_minute_cents / 100).toFixed(2),
    minFare: (d.min_fare_cents / 100).toFixed(2),
    economy: String(d.category_multipliers?.economy ?? 1),
    comfort: String(d.category_multipliers?.comfort ?? 1.4),
    premium: String(d.category_multipliers?.premium ?? 2),
  };
}

function PricingPanel({ token }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null); setSaved(false);
    adminGetPricing(token)
      .then((d) => setForm(_pricingForm(d)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function upd(k, v) { setSaved(false); setForm((f) => ({ ...f, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    const toCents = (v) => Math.round(parseFloat(v) * 100);
    setSaving(true); setError(null); setSaved(false);
    try {
      const d = await adminSetPricing(token, {
        base_fare_cents: toCents(form.base),
        per_mile_cents: toCents(form.perMile),
        per_minute_cents: toCents(form.perMinute),
        min_fare_cents: toCents(form.minFare),
        category_multipliers: {
          economy: parseFloat(form.economy),
          comfort: parseFloat(form.comfort),
          premium: parseFloat(form.premium),
        },
      });
      setForm(_pricingForm(d));
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="pricing-panel">
      <div className="panel-header">
        <h2 className="panel-title">💵 Fare Formula</h2>
        <button className="refresh-btn" onClick={load} disabled={loading || saving}>↻</button>
      </div>
      <p className="pricing-formula">
        fare = max(<strong>min</strong>, (<strong>base</strong> + miles×<strong>per-mile</strong> + minutes×<strong>per-minute</strong>) × surge) × <strong>category</strong>
      </p>
      {error && <p className="form-error">{error}</p>}
      {saved && <div className="status ok">✓ Saved — applies to new estimates immediately.</div>}
      {loading && <div className="status loading">⏳ Loading…</div>}
      {form && (
        <form className="pricing-form" onSubmit={handleSave}>
          <div className="pricing-grid">
            <label className="pricing-field"><span>Base fare ($)</span>
              <input type="number" step="0.01" min="0.01" value={form.base} onChange={(e) => upd("base", e.target.value)} required /></label>
            <label className="pricing-field"><span>Per mile ($)</span>
              <input type="number" step="0.01" min="0.01" value={form.perMile} onChange={(e) => upd("perMile", e.target.value)} required /></label>
            <label className="pricing-field"><span>Per minute ($)</span>
              <input type="number" step="0.01" min="0" value={form.perMinute} onChange={(e) => upd("perMinute", e.target.value)} required /></label>
            <label className="pricing-field"><span>Minimum fare ($)</span>
              <input type="number" step="0.01" min="0.01" value={form.minFare} onChange={(e) => upd("minFare", e.target.value)} required /></label>
          </div>
          <h3 className="pricing-subtitle">Category multipliers</h3>
          <div className="pricing-grid">
            <label className="pricing-field"><span>Economy ×</span>
              <input type="number" step="0.05" min="0.1" value={form.economy} onChange={(e) => upd("economy", e.target.value)} required /></label>
            <label className="pricing-field"><span>Comfort ×</span>
              <input type="number" step="0.05" min="0.1" value={form.comfort} onChange={(e) => upd("comfort", e.target.value)} required /></label>
            <label className="pricing-field"><span>Premium ×</span>
              <input type="number" step="0.05" min="0.1" value={form.premium} onChange={(e) => upd("premium", e.target.value)} required /></label>
          </div>
          <button type="submit" className="pricing-save-btn" disabled={saving}>
            {saving ? "Saving…" : "💾 Save fare formula"}
          </button>
        </form>
      )}
    </div>
  );
}

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
    if (isNaN(val)) { setError("Invalid value."); return; }
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
        <h2 className="panel-title">⚙️ Dynamic Pricing</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>
      {loading && <div className="status loading">⏳ Loading…</div>}
      {!loading && current !== null && (
        <div className="surge-current">
          <span className="surge-label">Current multiplier:</span>
          <span className="surge-value" style={{ color: surgeColor }}>×{current}</span>
          {current === 1.0 && <span className="surge-badge normal">Normal price</span>}
          {current > 1.0 && current < 2.0 && <span className="surge-badge moderate">Moderate</span>}
          {current >= 2.0 && <span className="surge-badge high">High demand</span>}
        </div>
      )}
      <form className="surge-form" onSubmit={handleSave}>
        <label className="surge-form-label">
          New multiplier (1.0 – 5.0)
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
              {saving ? "…" : "Apply"}
            </button>
          </div>
        </label>
        {error && <p className="form-error">{error}</p>}
        {success && <p className="surge-success">✓ Multiplier updated</p>}
      </form>
      <div className="surge-hint">
        <p>1.0 = base price · 2.0 = double price · max 5.0</p>
        <p>Takes effect immediately on next estimates.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Applications Panel — Sprint 30
// ---------------------------------------------------------------------------

const APP_STATUS_LABELS = {
  submitted:    "📤 Submitted",
  under_review: "🔍 Under Review",
  approved:     "✅ Approved",
  rejected:     "✗ Rejected",
};

const APP_STATUS_FILTERS = [
  { value: "",            label: "All" },
  { value: "submitted",   label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "approved",    label: "Approved" },
  { value: "rejected",    label: "Rejected" },
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
        <h2 className="panel-title">📝 Driver Applications</h2>
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
      {loading && <div className="status loading">⏳ Loading…</div>}
      {!loading && apps.length === 0 && <p className="muted-msg">No applications.</p>}

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
            <span>{new Date(a.submitted_at).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}</span>
          </div>
          {a.notes_admin && <p className="application-admin-note">💬 {a.notes_admin}</p>}
          {(a.status === "submitted" || a.status === "under_review") && (
            <div className="application-admin-actions">
              <input
                className="payout-note-input"
                type="text"
                placeholder="Note (optional)"
                value={noteInputs[a.application_id] ?? ""}
                onChange={(e) => setNoteInputs((prev) => ({ ...prev, [a.application_id]: e.target.value }))}
              />
              {a.status === "submitted" && (
                <button
                  className="payout-approve-btn"
                  disabled={acting === a.application_id}
                  onClick={() => handleReview(a.application_id, "under_review")}
                >🔍 Under Review</button>
              )}
              <button
                className="payout-approve-btn"
                disabled={acting === a.application_id}
                onClick={() => handleReview(a.application_id, "approved")}
              >✅ Approve</button>
              <button
                className="payout-reject-btn"
                disabled={acting === a.application_id}
                onClick={() => handleReview(a.application_id, "rejected")}
              >✗ Reject</button>
            </div>
          )}
        </div>
      ))}

      {(apps.length === PAGE_SIZE_APPS || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={apps.length < PAGE_SIZE_APPS || loading}>Next →</button>
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
        <h2 className="panel-title">🗺️ Online Drivers</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && <div className="status loading">⏳ Loading…</div>}
      {!loading && drivers.length === 0 && (
        <p className="muted-msg">No drivers online currently.</p>
      )}

      {/* Mapbox live map */}
      {!loading && <LiveMap drivers={drivers} />}

      {/* Text list (scrollable detail below the map) */}
      {!loading && drivers.length > 0 && (
        <div className="live-drivers-table" style={{ marginTop: "12px" }}>
          {drivers.map((d) => (
            <div key={d.driver_id} className="live-driver-row">
              <div className="live-driver-main">
                <span className="live-driver-name">🧑‍✈️ {d.email}</span>
                <span className="live-driver-status online">🟢 Online</span>
              </div>
              <div className="live-driver-meta">
                {d.lat != null && d.lng != null ? (
                  <span className="live-driver-coords">📍 {d.lat.toFixed(4)}, {d.lng.toFixed(4)}</span>
                ) : (
                  <span className="live-driver-coords muted">📍 Location unknown</span>
                )}
                {d.heading != null && (
                  <span className="live-driver-heading">🧭 {d.heading}°</span>
                )}
                {d.last_updated && (
                  <span className="live-driver-time">
                    ⏱️ {new Date(d.last_updated).toLocaleTimeString("en-US")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted-msg" style={{ marginTop: "12px", fontSize: ".8rem" }}>
        Auto-refresh every 30 seconds.
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
      {loading && <div className="status loading">⏳ Loading…</div>}

      {!loading && flags.length === 0 && <p className="muted-msg">No flags configured.</p>}

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
                title={flag.enabled ? "Disable" : "Enable"}
              >
                {flag.enabled ? "✅ Enabled" : "⛔ Disabled"}
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
        <h3 className="section-subtitle">🎟️ Invite Codes</h3>
        <form className="invite-code-form" onSubmit={handleCreateCode}>
          <input
            type="text"
            className="invite-code-input"
            placeholder="Code (e.g., BETA-LAUNCH-001)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            required
          />
          <label>Max uses</label>
          <input
            type="number"
            className="invite-uses-input"
            min="1" max="1000"
            value={maxUses}
            onChange={(e) => setMaxUses(parseInt(e.target.value, 10) || 1)}
          />
          <button type="submit" className="batch-run-btn" disabled={creatingCode}>
            {creatingCode ? "Creating…" : "Create code"}
          </button>
        </form>
        {codeError && <p className="form-error">{codeError}</p>}
        {codeResult && (
          <div className="batch-result">
            <p className="batch-result-row">✅ Code created: <strong>{codeResult.code}</strong></p>
            <p className="batch-result-row">Max uses: {codeResult.max_uses}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CitiesPanel — Sprint 32 / Sprint 45 (zone enforcement + sub-zone management)
// ---------------------------------------------------------------------------

const COUNTRY_DEFAULT = "United States";

/**
 * CityZones — collapsible sub-zone list for a single city.
 * Shows existing zones, lets admin toggle active and delete them,
 * and provides a quick "Add zone" inline form.
 */
function CityZones({ token, city }) {
  const [open, setOpen] = useState(false);
  const [zones, setZones] = useState([]);
  const [loadingZ, setLoadingZ] = useState(false);
  const [zoneName, setZoneName] = useState("");
  const [zoneErr, setZoneErr] = useState(null);

  const loadZones = useCallback(async () => {
    setLoadingZ(true);
    try {
      const data = await adminListServiceZones(token, city.city_id);
      setZones(data);
    } catch (e) { setZoneErr(e.message); }
    finally { setLoadingZ(false); }
  }, [token, city.city_id]);

  useEffect(() => { if (open) loadZones(); }, [open, loadZones]);

  async function handleAddZone(e) {
    e.preventDefault();
    if (!zoneName.trim()) return;
    setZoneErr(null);
    try {
      const created = await adminCreateServiceZone(token, {
        city_id: city.city_id,
        name: zoneName.trim(),
        active: true,
      });
      setZones((prev) => [...prev, created]);
      setZoneName("");
    } catch (e) { setZoneErr(e.message); }
  }

  async function handleToggleZone(zone) {
    try {
      const updated = await adminUpdateServiceZone(token, zone.zone_id, { active: !zone.active });
      setZones((prev) => prev.map((z) => z.zone_id === zone.zone_id ? updated : z));
    } catch (e) { setZoneErr(e.message); }
  }

  async function handleDeleteZone(zone) {
    if (!window.confirm(`Delete zone "${zone.name}"?`)) return;
    try {
      await adminDeleteServiceZone(token, zone.zone_id);
      setZones((prev) => prev.filter((z) => z.zone_id !== zone.zone_id));
    } catch (e) { setZoneErr(e.message); }
  }

  return (
    <div className="city-zones-wrap">
      <button
        className="zone-toggle-btn"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▲" : "▼"} Sub-zones ({open ? zones.length : "…"})
      </button>

      {open && (
        <div className="city-zones-body">
          {zoneErr && <p className="form-error" style={{ margin: "4px 0" }}>{zoneErr}</p>}
          {loadingZ && <p style={{ color: "#94a3b8", fontSize: ".8rem" }}>⏳ Loading zones…</p>}

          {zones.length === 0 && !loadingZ && (
            <p style={{ color: "#94a3b8", fontSize: ".8rem", margin: "4px 0" }}>No sub-zones defined.</p>
          )}

          {zones.map((zone) => (
            <div key={zone.zone_id} className={`zone-row ${zone.active ? "" : "zone-inactive"}`}>
              <span className="zone-name">{zone.active ? "🟢" : "⚪"} {zone.name}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  className={zone.active ? "payout-reject-btn" : "payout-approve-btn"}
                  style={{ fontSize: ".75rem", padding: "2px 8px" }}
                  onClick={() => handleToggleZone(zone)}
                >
                  {zone.active ? "Off" : "On"}
                </button>
                <button
                  className="payout-reject-btn"
                  style={{ fontSize: ".75rem", padding: "2px 8px" }}
                  onClick={() => handleDeleteZone(zone)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          <form className="zone-add-form" onSubmit={handleAddZone}>
            <input
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="New sub-zone name…"
              style={{ flex: 1 }}
            />
            <button type="submit" className="batch-run-btn" style={{ fontSize: ".8rem", padding: "4px 10px" }}>
              + Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function CitiesPanel({ token }) {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [editRadius, setEditRadius] = useState({}); // city_id → new radius string
  const [editCity, setEditCity] = useState(null);   // city being edited (null = none)
  const [editForm, setEditForm] = useState({});     // fields for the edit form
  const [form, setForm] = useState({
    name: "", country: COUNTRY_DEFAULT, zone_type: "city",
    center_lat: "", center_lng: "", radius_km: "50", active: true,
  });

  // Load with seed=false so admin sees the real DB state (empty until explicitly seeded)
  const load = useCallback(() => {
    setLoading(true); setError(null);
    adminListCities(token, { seed: false })
      .then(setCities)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Explicit seed action — triggered by the onboarding button
  async function handleSeedDefaults() {
    setSeeding(true); setError(null);
    try {
      const seeded = await adminSeedDefaultCities(token);
      setCities(seeded);
    } catch (e) { setError(e.message); }
    finally { setSeeding(false); }
  }

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true); setSaveError(null);
    try {
      const created = await adminCreateCity(token, {
        name: form.name.trim(),
        country: form.country,
        zone_type: form.zone_type,
        center_lat: parseFloat(form.center_lat),
        center_lng: parseFloat(form.center_lng),
        radius_km: parseFloat(form.radius_km),
        active: form.active,
      });
      setCities((prev) => [...prev, created]);
      setShowForm(false);
      setForm({ name: "", country: COUNTRY_DEFAULT, zone_type: "city", center_lat: "", center_lng: "", radius_km: "50", active: true });
    } catch (err) { setSaveError(err.message); }
    finally { setSaving(false); }
  }

  async function handleToggleActive(city) {
    try {
      const updated = await adminUpdateCity(token, city.city_id, { active: !city.active });
      setCities((prev) => prev.map((c) => c.city_id === city.city_id ? updated : c));
    } catch (err) { setError(err.message); }
  }

  async function handleSaveRadius(city) {
    const km = parseFloat(editRadius[city.city_id]);
    if (!km || km <= 0) return;
    try {
      const updated = await adminUpdateCity(token, city.city_id, { radius_km: km });
      setCities((prev) => prev.map((c) => c.city_id === city.city_id ? updated : c));
      setEditRadius((prev) => { const n = { ...prev }; delete n[city.city_id]; return n; });
    } catch (err) { setError(err.message); }
  }

  function openEditCity(city) {
    setEditCity(city.city_id);
    setEditForm({
      name: city.name,
      country: city.country,
      zone_type: city.zone_type || "city",
      center_lat: String(city.center_lat),
      center_lng: String(city.center_lng),
      radius_km: String(city.radius_km),
    });
  }

  async function handleEditSave(e) {
    e.preventDefault();
    setSaving(true); setSaveError(null);
    try {
      const updated = await adminUpdateCity(token, editCity, {
        name: editForm.name.trim(),
        country: editForm.country,
        zone_type: editForm.zone_type,
        center_lat: parseFloat(editForm.center_lat),
        center_lng: parseFloat(editForm.center_lng),
        radius_km: parseFloat(editForm.radius_km),
      });
      setCities((prev) => prev.map((c) => c.city_id === editCity ? updated : c));
      setEditCity(null);
    } catch (err) { setSaveError(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(city) {
    if (!window.confirm(`Delete zone "${city.name}"? This cannot be undone.`)) return;
    try {
      await adminDeleteCity(token, city.city_id);
      setCities((prev) => prev.filter((c) => c.city_id !== city.city_id));
      if (editCity === city.city_id) setEditCity(null);
    } catch (err) { setError(err.message); }
  }

  const activeCities = cities.filter((c) => c.active);
  const isEmpty = !loading && cities.length === 0;

  return (
    <div className="cities-panel">

      {/* ── Enforcement banner (only shown once at least one city exists) ── */}
      {!isEmpty && (
        <div className={`zone-enforcement-banner ${activeCities.length > 0 ? "zone-enforced" : "zone-open"}`}>
          {activeCities.length > 0 ? (
            <>
              ✅ <strong>Zone enforcement ACTIVE</strong> — customers can only book trips within: {activeCities.map((c) => (
                <strong key={c.city_id}> {c.name} ({c.radius_km} km radius)</strong>
              ))}.
              <br />
              <span style={{ opacity: .8 }}>Deactivate a zone to stop serving that area. Adjust the radius (✏️) to fine-tune coverage.</span>
            </>
          ) : (
            <>
              ⚠️ <strong>All zones deactivated</strong> — zone enforcement is currently OFF.
              All locations are accepted. Activate at least one zone to restrict bookings
              to specific areas.
            </>
          )}
        </div>
      )}

      <div className="panel-header">
        <h2 className="panel-title">🗺️ Service Zones</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
          {!isEmpty && (
            <button className="batch-run-btn" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "✕ Cancel" : "+ New Zone"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <div className="status loading">⏳ Loading…</div>}

      {/* ── Onboarding state: no zones configured yet ─────────────── */}
      {isEmpty && (
        <div className="zone-onboarding-card">
          <div className="zone-onboarding-icon">🗺️</div>
          <h3 className="zone-onboarding-title">No service zones configured</h3>
          <p className="zone-onboarding-desc">
            Zone enforcement is currently <strong>OFF</strong> — customers can book
            trips from any location.
          </p>
          <p className="zone-onboarding-desc">
            To restrict bookings to specific geographic areas, configure at least
            one zone. Each zone is defined by a city center and a coverage radius.
          </p>

          <div className="zone-onboarding-actions">
            <div className="zone-onboarding-option">
              <strong>Option 1 — Quick start (New Jersey)</strong>
              <p style={{ margin: "4px 0 8px", color: "#6b7280", fontSize: ".85rem" }}>
                Load the pre-configured zones for Newark (15 km), Jersey City (12 km),
                Trenton (12 km) and more NJ cities. You can activate or adjust them afterwards.
              </p>
              <button
                className="batch-run-btn"
                style={{ backgroundColor: "#16a34a" }}
                onClick={handleSeedDefaults}
                disabled={seeding}
              >
                {seeding ? "⏳ Loading…" : "🗺️ Load New Jersey default zones"}
              </button>
            </div>

            <div className="zone-onboarding-divider">— or —</div>

            <div className="zone-onboarding-option">
              <strong>Option 2 — Custom zone</strong>
              <p style={{ margin: "4px 0 8px", color: "#6b7280", fontSize: ".85rem" }}>
                Define your own zone by providing the center coordinates and
                coverage radius (in km).
              </p>
              <button
                className="batch-run-btn"
                onClick={() => setShowForm(true)}
              >
                ＋ Create a custom zone
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <form className="city-form" onSubmit={handleCreate}>
          <h3 className="section-subtitle">Add a City / Zone</h3>
          {saveError && <p className="form-error">{saveError}</p>}
          <div className="city-form-grid">
            <label>Name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Newark" />
            </label>
            <label>Country
              <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </label>
            <label>Zone Type
              <select value={form.zone_type} onChange={(e) => setForm({ ...form, zone_type: e.target.value })}>
                <option value="city">City</option>
                <option value="state">State</option>
                <option value="country">Country</option>
              </select>
            </label>
            <label>Center Latitude
              <input type="number" step="any" required value={form.center_lat} onChange={(e) => setForm({ ...form, center_lat: e.target.value })} placeholder="40.7357" />
            </label>
            <label>Center Longitude
              <input type="number" step="any" required value={form.center_lng} onChange={(e) => setForm({ ...form, center_lng: e.target.value })} placeholder="-74.1724" />
            </label>
            <label>Radius (km)
              <input type="number" step="1" min="1" value={form.radius_km} onChange={(e) => setForm({ ...form, radius_km: e.target.value })} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active on creation
            </label>
          </div>
          <button type="submit" className="batch-run-btn" disabled={saving}>
            {saving ? "Creating…" : "Create zone"}
          </button>
        </form>
      )}

      {/* ── Inline edit form for a zone ── */}
      {editCity && (
        <form className="city-form" onSubmit={handleEditSave} style={{ marginBottom: "16px" }}>
          <h3 className="section-subtitle">✏️ Edit zone</h3>
          {saveError && <p className="form-error">{saveError}</p>}
          <div className="city-form-grid">
            <label>Name
              <input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </label>
            <label>Country
              <input value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} />
            </label>
            <label>Zone Type
              <select value={editForm.zone_type} onChange={(e) => setEditForm({ ...editForm, zone_type: e.target.value })}>
                <option value="city">City</option>
                <option value="state">State</option>
                <option value="country">Country</option>
              </select>
            </label>
            <label>Center Latitude
              <input type="number" step="any" required value={editForm.center_lat} onChange={(e) => setEditForm({ ...editForm, center_lat: e.target.value })} placeholder="40.0583" />
            </label>
            <label>Center Longitude
              <input type="number" step="any" required value={editForm.center_lng} onChange={(e) => setEditForm({ ...editForm, center_lng: e.target.value })} placeholder="-74.4057" />
            </label>
            <label>Radius (km)
              <input type="number" step="1" min="1" value={editForm.radius_km} onChange={(e) => setEditForm({ ...editForm, radius_km: e.target.value })} />
            </label>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="submit" className="batch-run-btn" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
            <button type="button" className="payout-reject-btn" onClick={() => setEditCity(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="cities-grid">
        {cities.map((city) => (
          <div key={city.city_id} className={`city-row ${city.active ? "city-active" : "city-inactive"}`}>
            <div className="city-main">
              <span className="city-name">{city.active ? "🟢" : "⚪"} {city.name}</span>
              <span className="city-country">{city.country} · <em>{city.zone_type || "city"}</em></span>
            </div>
            <div className="city-meta">
              <span>📍 {city.center_lat.toFixed(4)}, {city.center_lng.toFixed(4)}</span>

              {/* Inline radius editor */}
              {editRadius[city.city_id] !== undefined ? (
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <input
                    type="number" min="1" step="1"
                    value={editRadius[city.city_id]}
                    onChange={(e) => setEditRadius((prev) => ({ ...prev, [city.city_id]: e.target.value }))}
                    style={{ width: "60px", padding: "2px 4px", fontSize: ".8rem" }}
                  />
                  <span style={{ fontSize: ".8rem" }}>km</span>
                  <button
                    className="payout-approve-btn"
                    style={{ fontSize: ".75rem", padding: "2px 8px" }}
                    onClick={() => handleSaveRadius(city)}
                  >✓</button>
                  <button
                    className="payout-reject-btn"
                    style={{ fontSize: ".75rem", padding: "2px 8px" }}
                    onClick={() => setEditRadius((prev) => { const n = { ...prev }; delete n[city.city_id]; return n; })}
                  >✕</button>
                </span>
              ) : (
                <span
                  className="city-radius-badge"
                  onClick={() => setEditRadius((prev) => ({ ...prev, [city.city_id]: String(city.radius_km) }))}
                  title="Click to edit radius"
                >
                  📏 {city.radius_km} km ✏️
                </span>
              )}
            </div>
            <div className="city-footer-row">
              <button
                className={city.active ? "payout-reject-btn" : "payout-approve-btn"}
                style={{ fontSize: ".8rem", padding: "4px 10px" }}
                onClick={() => handleToggleActive(city)}
              >
                {city.active ? "Deactivate" : "Activate"}
              </button>
              <button
                className="batch-run-btn"
                style={{ fontSize: ".8rem", padding: "4px 10px" }}
                onClick={() => openEditCity(city)}
              >
                ✏️ Edit
              </button>
              <button
                className="payout-reject-btn"
                style={{ fontSize: ".8rem", padding: "4px 10px" }}
                onClick={() => handleDelete(city)}
              >
                🗑️ Delete
              </button>
            </div>

            {/* Sub-zones for this city */}
            <CityZones token={token} city={city} />
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
      <span className="kpi-value">{typeof value === "number" ? value.toLocaleString("en-US") : value}{unit}</span>
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
        <h2 className="panel-title">📈 Advanced Analytics</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && <div className="status loading">⏳ Loading analytics…</div>}

      {kpis && (
        <div className="kpi-grid">
          <KPICard icon="👥" label="Users" value={kpis.total_users} />
          <KPICard icon="🧑‍✈️" label="Drivers" value={kpis.total_drivers} />
          <KPICard icon="🟢" label="Online" value={kpis.online_drivers} />
          <KPICard icon="🚕" label="Total Trips" value={kpis.total_trips} />
          <KPICard icon="✅" label="Completion Rate" value={kpis.completion_rate_pct} unit="%" />
          <KPICard icon="💰" label="Total Revenue" value={formatUSD(kpis.total_revenue_cents)} />
          <KPICard icon="⭐" label="Avg Rating" value={kpis.avg_rating} />
        </div>
      )}

      {/* Revenue chart (text-based sparkline) */}
      <div className="analytics-section">
        <div className="analytics-section-header">
          <h3 className="analytics-subtitle">💰 Revenue by Period</h3>
          <div className="period-tabs">
            {["day", "week", "month"].map((p) => (
              <button
                key={p}
                className={`period-tab ${revPeriod === p ? "active" : ""}`}
                onClick={() => { setRevPeriod(p); loadRevenue(p); }}
              >{p === "day" ? "Day" : p === "week" ? "Week" : "Month"}</button>
            ))}
          </div>
        </div>
        {revenue.length === 0 && <p className="muted-msg">No revenue data.</p>}
        {revenue.map((r) => (
          <div key={r.period} className="analytics-bar-row">
            <span className="analytics-bar-label">{r.period}</span>
            <span className="analytics-bar-trips">{r.trip_count} trips</span>
            <span className="analytics-bar-revenue">{formatUSD(r.revenue_cents)}</span>
          </div>
        ))}
      </div>

      {/* Category breakdown */}
      <div className="analytics-section">
        <h3 className="analytics-subtitle">🚗 Breakdown by Category</h3>
        {categories.length === 0 && <p className="muted-msg">No data.</p>}
        {categories.map((c) => (
          <div key={c.category} className="analytics-bar-row">
            <span className="analytics-bar-label" style={{ textTransform: "capitalize" }}>{c.category}</span>
            <span className="analytics-bar-trips">{c.trip_count} trips</span>
            <span className="analytics-bar-revenue">avg. {formatUSD(c.avg_fare_cents)}</span>
          </div>
        ))}
      </div>

      {/* Hourly demand (mini bar chart) */}
      <div className="analytics-section">
        <h3 className="analytics-subtitle">⏰ Hourly Demand</h3>
        <div className="hourly-chart">
          {hourly.map((h) => (
            <div key={h.hour} className="hourly-bar-col">
              <div
                className="hourly-bar"
                style={{ height: `${Math.round((h.trip_count / maxHourly) * 60)}px` }}
                title={`Hour ${h.hour}: ${h.trip_count} trips`}
              />
              <span className="hourly-label">{h.hour}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top customers */}
      {topCustomers.length > 0 && (
        <div className="analytics-section">
          <h3 className="analytics-subtitle">👑 Top Customers</h3>
          {topCustomers.map((c, i) => (
            <div key={c.user_id} className="analytics-bar-row">
              <span className="analytics-rank">#{i + 1}</span>
              <span className="analytics-bar-label">{c.email}</span>
              <span className="analytics-bar-trips">{c.trip_count} trips</span>
              <span className="analytics-bar-revenue">{formatUSD(c.total_spent_cents)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Driver performance */}
      {driverPerf.length > 0 && (
        <div className="analytics-section">
          <h3 className="analytics-subtitle">🏆 Driver Performance</h3>
          {driverPerf.map((d, i) => (
            <div key={d.driver_id} className="analytics-bar-row">
              <span className="analytics-rank">#{i + 1}</span>
              <span className="analytics-bar-label">{d.email}</span>
              <span className="analytics-bar-trips">{d.trip_count} trips</span>
              <span className="analytics-bar-rating">⭐ {d.avg_rating}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Services Panel — Sprint 36
// ---------------------------------------------------------------------------

const SERVICE_DEFS = [
  {
    key: "rideshare_customer",
    icon: "🚕",
    label: "Ride-share for Customers",
    desc: "Allow customers to book rides.",
  },
  {
    key: "rideshare_driver",
    icon: "🧑‍✈️",
    label: "Ride-share for Drivers",
    desc: "Allow drivers to see and accept ride requests.",
  },
];

function ServicesPanel({ token }) {
  const [flags, setFlags] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    adminGetServices(token)
      .then(setFlags)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(key, currentValue) {
    setSaving(key);
    try {
      const updated = await adminSetService(token, { [key]: !currentValue });
      setFlags(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="services-panel">
      <div className="panel-header">
        <h2 className="panel-title">🔧 Service Activation</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && <div className="status loading">⏳ Loading…</div>}
      {flags && (
        <div className="services-grid">
          {SERVICE_DEFS.map(({ key, icon, label, desc }) => {
            const enabled = flags[key];
            const busy = saving === key;
            return (
              <div key={key} className={`service-card ${enabled ? "service-on" : "service-off"}`}>
                <div className="service-card-top">
                  <span className="service-icon">{icon}</span>
                  <span className="service-label">{label}</span>
                  <span className={`service-badge ${enabled ? "badge-on" : "badge-off"}`}>
                    {enabled ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="service-desc">{desc}</p>
                <button
                  className={`service-toggle-btn ${enabled ? "toggle-disable" : "toggle-enable"}`}
                  disabled={busy}
                  onClick={() => handleToggle(key, enabled)}
                >
                  {busy ? "…" : enabled ? "Deactivate" : "Activate"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sprint 47 — CraftPanel
// ---------------------------------------------------------------------------

function CraftPanel({ token }) {
  const [tab, setTab] = useState("requests");

  // ── Craft Requests ────────────────────────────────────────────────────────
  const [requests, setRequests] = useState([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState(null);

  // ── Professionals ─────────────────────────────────────────────────────────
  const [professionals, setProfessionals] = useState([]);
  const [proLoading, setProLoading] = useState(false);
  const [proError, setProError] = useState(null);
  const [selectedProId, setSelectedProId] = useState(null); // Sprint 60

  // ── Bids for expanded request ─────────────────────────────────────────────
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const [bids, setBids] = useState([]);
  const [bidsLoading, setBidsLoading] = useState(false);

  useEffect(() => {
    if (tab === "requests") {
      setReqLoading(true);
      adminListCraftRequests(token)
        .then(setRequests)
        .catch((e) => setReqError(e.message))
        .finally(() => setReqLoading(false));
    } else if (tab === "professionals") {
      setProLoading(true);
      adminListProfessionals(token)
        .then(setProfessionals)
        .catch((e) => setProError(e.message))
        .finally(() => setProLoading(false));
    }
  }, [tab, token]);

  const loadBids = async (requestId) => {
    if (expandedRequestId === requestId) {
      setExpandedRequestId(null);
      return;
    }
    setExpandedRequestId(requestId);
    setBidsLoading(true);
    try {
      const data = await adminListBidsForRequest(token, requestId);
      setBids(data);
    } catch {
      setBids([]);
    } finally {
      setBidsLoading(false);
    }
  };

  const STATUS_COLORS = {
    open: "#059669", bidding_closed: "#D97706", assigned: "#2563EB",
    in_progress: "#7C3AED", completed: "#6B7280", cancelled: "#EF4444",
  };

  return (
    <section>
      <h2>🛠️ Ziza Craft — Sprint 47</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["requests", "professionals"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: tab === t ? "#059669" : "#fff",
              color: tab === t ? "#fff" : "#333",
              cursor: "pointer",
              fontWeight: tab === t ? 700 : 400,
            }}
          >
            {t === "requests" ? "📋 Requests" : "👷 Professionals"}
          </button>
        ))}
      </div>

      {/* ── Craft Requests Tab ─────────────────────────────────────────────── */}
      {tab === "requests" && (
        <>
          {reqLoading && <p>Loading…</p>}
          {reqError && <p style={{ color: "red" }}>{reqError}</p>}
          {!reqLoading && requests.length === 0 && <p style={{ color: "#888" }}>No craft requests yet.</p>}
          {requests.map((r) => (
            <div key={r.request_id} style={{
              border: "1px solid #E5E7EB", borderRadius: 10, padding: 14,
              marginBottom: 12, background: "#fff"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{
                  background: "#ECFDF5", color: "#059669",
                  fontWeight: 700, fontSize: 12,
                  borderRadius: 6, padding: "2px 8px"
                }}>{r.category.toUpperCase()}</span>
                <span style={{ color: STATUS_COLORS[r.status] ?? "#6B7280", fontWeight: 600, fontSize: 12 }}>
                  {r.status.replace("_", " ")}
                </span>
              </div>
              <p style={{ margin: "0 0 4px", fontSize: 14 }}>{r.description}</p>
              {r.address && <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6B7280" }}>📍 {r.address}</p>}
              <p style={{ margin: "0 0 4px", fontSize: 12, color: "#9CA3AF" }}>
                ID: {r.request_id.slice(0, 8)}… · Posted: {new Date(r.created_at).toLocaleDateString()}
              </p>
              {r.bid_deadline && (
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "#D97706" }}>
                  ⏱ Deadline: {new Date(r.bid_deadline).toLocaleString()}
                </p>
              )}
              <button
                onClick={() => loadBids(r.request_id)}
                style={{
                  background: "#F0FDF4", color: "#059669",
                  border: "1px solid #A7F3D0", borderRadius: 6,
                  padding: "4px 12px", fontSize: 12, cursor: "pointer",
                }}
              >
                {expandedRequestId === r.request_id ? "▲ Hide bids" : "▼ View bids"}
              </button>

              {expandedRequestId === r.request_id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E5E7EB" }}>
                  {bidsLoading ? (
                    <p>Loading bids…</p>
                  ) : bids.length === 0 ? (
                    <p style={{ color: "#9CA3AF", fontSize: 13 }}>No bids yet.</p>
                  ) : (
                    bids.map((b) => (
                      <div key={b.bid_id} style={{
                        background: "#F9FAFB", borderRadius: 8,
                        padding: 10, marginBottom: 8,
                        border: b.status === "accepted" ? "2px solid #059669" : "1px solid #E5E7EB"
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <strong>{formatUSD(b.price_cents)}</strong>
                          <span style={{ fontSize: 12, color: b.status === "accepted" ? "#059669" : b.status === "rejected" ? "#9CA3AF" : "#D97706" }}>
                            {b.status}
                          </span>
                        </div>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6B7280" }}>
                          ⏱ ETA: {b.eta_min} min
                          {b.distance_km != null ? ` · 📏 ${fmtMiles(b.distance_km)} mi` : ""}
                        </p>
                        {b.note && <p style={{ margin: "4px 0 0", fontSize: 12, fontStyle: "italic" }}>{b.note}</p>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* ── Professionals Tab ─────────────────────────────────────────────── */}
      {tab === "professionals" && (
        <>
          {/* Sprint 60 — full profile + docs view for selected professional */}
          {selectedProId ? (
            <UserReviewPanel
              token={token}
              entityId={selectedProId}
              entityType="professional"
              onBack={() => { setSelectedProId(null); }}
            />
          ) : (
            <>
              {proLoading && <p>Loading…</p>}
              {proError && <p style={{ color: "red" }}>{proError}</p>}
              {!proLoading && professionals.length === 0 && <p style={{ color: "#888" }}>No professionals registered yet.</p>}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    {["ID", "Specialties", "Status", "Online", "Joined", "Actions"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {professionals.map((p) => (
                    <tr key={p.professional_id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 11 }}>{p.professional_id.slice(0, 8)}…</td>
                      <td style={{ padding: "6px 8px" }}>{p.specialties || "—"}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <span style={{
                          background: p.status === "active" ? "#D1FAE5" : "#FEE2E2",
                          color: p.status === "active" ? "#059669" : "#EF4444",
                          borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 600,
                        }}>{p.status}</span>
                      </td>
                      <td style={{ padding: "6px 8px" }}>{p.is_online ? "🟢" : "⚫"}</td>
                      <td style={{ padding: "6px 8px", color: "#9CA3AF" }}>{new Date(p.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <button
                          className="view-docs-btn"
                          onClick={() => setSelectedProId(p.professional_id)}
                          title="View full profile and documents"
                        >
                          👁 View Docs
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Onboarding Review — Sprint 57
// ---------------------------------------------------------------------------

// ── Sub-components defined at module level so React never remounts them ──────

const REVIEW_STATUS_BADGE = {
  active:       { bg: "#D1FAE5", color: "#065F46" },
  pending_docs: { bg: "#FEF3C7", color: "#92400E" },
  suspended:    { bg: "#FEE2E2", color: "#991B1B" },
  inactive:     { bg: "#F3F4F6", color: "#374151" },
};

const VEHICLE_CATEGORY_LABELS = {
  economy: "🚗 Economy",
  comfort: "🛋️ Comfort",
  xl:      "🚐 XL",
  electric:"⚡ Electric",
};

function ProfileField({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <div style={{ fontSize: 14, color: "#F9FAFB", marginTop: 2 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #E5E7EB", paddingBottom: 6, marginTop: 24, marginBottom: 14 }}>
      {children}
    </h3>
  );
}

const DOC_STATUS_COLORS = {
  pending:            { bg: "#FEF3C7", color: "#D97706" },
  approved:           { bg: "#D1FAE5", color: "#059669" },
  rejected:           { bg: "#FEE2E2", color: "#DC2626" },
  needs_resubmission: { bg: "#FDE8D8", color: "#C05621" },
};

// Sprint 66 — read-only conversation viewer for admins. Fetching as admin does
// NOT mark the participants' messages as read (enforced server-side).
function AdminConversation({ token, scope, id }) {
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setMessages(null); setError(null);
    const fetcher = scope === "trip" ? adminListTripMessages : adminListRequestMessages;
    fetcher(token, id)
      .then((m) => { if (active) setMessages(m); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [token, scope, id]);

  const box = { marginTop: 8, padding: 10, background: "#0b1220", border: "1px solid #1f2937", borderRadius: 8 };
  const bubble = (m) => ({
    maxWidth: "80%", margin: "4px 0", padding: "6px 10px", borderRadius: 10, fontSize: 13,
    background: m.sender_role === "customer" ? "#1f2937" : "#134e4a",
    color: "#F9FAFB",
    alignSelf: m.sender_role === "customer" ? "flex-start" : "flex-end",
  });

  if (error) return <p className="form-error" style={{ marginTop: 8 }}>{error}</p>;
  if (messages === null) return <p style={{ color: "#9CA3AF", marginTop: 8 }}>⏳ Loading conversation…</p>;
  if (messages.length === 0) return <p style={{ color: "#9CA3AF", marginTop: 8 }}>No messages in this conversation.</p>;

  return (
    <div style={box}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {messages.map((m) => (
          <div key={m.message_id} style={bubble(m)}>
            <div style={{ fontSize: 10, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
              {m.sender_role} · {new Date(m.created_at).toLocaleString()}
            </div>
            {m.body}
          </div>
        ))}
      </div>
    </div>
  );
}

// Sprint 66 — per-driver history/earnings, per-professional summary (admin)
function HistoryEarningsSection({ token, entityId, entityType }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openConv, setOpenConv] = useState(null); // { scope, id } or null
  const toggleConv = (scope, id) =>
    setOpenConv((cur) => (cur && cur.scope === scope && cur.id === id ? null : { scope, id }));

  useEffect(() => {
    setLoading(true); setError(null);
    const load = entityType === "driver"
      ? Promise.all([
          adminGetDriverEarnings(token, entityId),
          adminGetDriverHistory(token, entityId, 20),
        ]).then(([earnings, history]) => ({ earnings, history }))
      : adminGetProfessionalSummary(token, entityId).then((summary) => ({ summary }));
    load.then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [token, entityId, entityType]);

  if (loading) return <p style={{ color: "#9CA3AF" }}>⏳ Loading…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!data) return null;

  const cell = { color: "#F9FAFB", fontSize: 14 };
  const lbl = { color: "#9CA3AF", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" };
  const row = { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1f2937" };
  const stats = { display: "flex", gap: 24, marginBottom: 12, flexWrap: "wrap" };

  if (entityType === "driver") {
    const e = data.earnings || {};
    const hist = data.history || [];
    return (
      <div>
        <div style={stats}>
          <div><div style={lbl}>Total earned</div><div style={{ ...cell, fontWeight: 700, fontSize: 20 }}>{formatUSD(e.total_cents ?? 0)}</div></div>
          <div><div style={lbl}>Trips</div><div style={cell}>{e.total_trips ?? 0}</div></div>
          <div><div style={lbl}>This week</div><div style={cell}>{formatUSD(e.week_cents ?? 0)}</div></div>
        </div>
        {hist.length === 0
          ? <p style={{ color: "#9CA3AF" }}>No trips yet.</p>
          : hist.map((t) => {
              const open = openConv && openConv.scope === "trip" && openConv.id === t.trip_id;
              return (
                <div key={t.trip_id}>
                  <div
                    style={{ ...row, cursor: "pointer" }}
                    onClick={() => toggleConv("trip", t.trip_id)}
                    title="View conversation"
                  >
                    <span style={cell}>{open ? "▾" : "▸"} {t.status} · {fmtMiles(Number(t.distance_km))} mi · {t.duration_min} min</span>
                    <span style={{ ...cell, fontWeight: 600 }}>{formatUSD(t.fare_cents)}</span>
                  </div>
                  {open && <AdminConversation token={token} scope="trip" id={t.trip_id} />}
                </div>
              );
            })}
      </div>
    );
  }

  const s = data.summary || {};
  const ivs = s.interventions || [];
  return (
    <div>
      <div style={stats}>
        <div><div style={lbl}>Total earned</div><div style={{ ...cell, fontWeight: 700, fontSize: 20 }}>{formatUSD(s.total_earnings_cents ?? 0)}</div></div>
        <div><div style={lbl}>Interventions</div><div style={cell}>{s.intervention_count ?? 0}</div></div>
      </div>
      {ivs.length === 0
        ? <p style={{ color: "#9CA3AF" }}>No interventions yet.</p>
        : ivs.map((iv) => {
            const open = openConv && openConv.scope === "request" && openConv.id === iv.request_id;
            return (
              <div key={iv.bid_id}>
                <div
                  style={{ ...row, cursor: "pointer" }}
                  onClick={() => toggleConv("request", iv.request_id)}
                  title="View conversation"
                >
                  <span style={cell}>{open ? "▾" : "▸"} {new Date(iv.created_at).toLocaleDateString()} · ETA {iv.eta_min} min</span>
                  <span style={{ ...cell, fontWeight: 600 }}>{formatUSD(iv.price_cents)}</span>
                </div>
                {open && <AdminConversation token={token} scope="request" id={iv.request_id} />}
              </div>
            );
          })}
    </div>
  );
}

function UserReviewPanel({ token, entityId, entityType, onBack }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acting, setActing] = useState(null);
  const [notes, setNotes] = useState({});
  const [previewDoc, setPreviewDoc] = useState(null); // { url, isPdf, label }

  const load = useCallback(() => {
    setLoading(true); setError(null);
    adminGetOnboardingDetail(token, entityId, entityType)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, entityId, entityType]);

  useEffect(() => { load(); }, [load]);

  async function handleDocAction(docId, newStatus) {
    const note = notes[docId] || null;
    setActing(docId);
    try {
      await adminUpdateDocumentStatus(token, docId, newStatus, note);
      await load();
    } catch (e) { setError(e.message); }
    finally { setActing(null); }
  }

  async function handleGlobalDecision(newStatus) {
    setActing("global");
    try {
      if (entityType === "driver") {
        await adminSetDriverStatus(token, entityId, newStatus);
      } else {
        await adminSetProfessionalStatus(token, entityId, newStatus);
      }
      onBack();
    } catch (e) { setError(e.message); setActing(null); }
  }

  if (loading && !detail) return <div className="status loading">⏳ Loading profile…</div>;

  return (
    <>
    {/* ── Document preview modal ─────────────────────────────────────────── */}
    {previewDoc && (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        onClick={() => setPreviewDoc(null)}
      >
        <div
          style={{ background: "#fff", borderRadius: 12, overflow: "hidden", width: "min(92vw, 920px)", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
            <div>
              <strong style={{ fontSize: 14, color: "#111827" }}>{previewDoc.label}</strong>
              <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 10 }}>{previewDoc.isPdf ? "PDF" : "Image"}</span>
            </div>
            <button
              onClick={() => setPreviewDoc(null)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#6B7280", lineHeight: 1, padding: "2px 6px" }}
              title="Close"
            >✕</button>
          </div>
          {/* Modal body */}
          <div style={{ flex: 1, overflow: "auto", background: "#1F2937", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 360 }}>
            {previewDoc.isPdf ? (
              <iframe
                src={previewDoc.url}
                style={{ width: "100%", height: "72vh", border: "none" }}
                title={previewDoc.label}
              />
            ) : (
              <img
                src={previewDoc.url}
                alt={previewDoc.label}
                style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain", display: "block" }}
              />
            )}
          </div>
        </div>
      </div>
    )}

    <div style={{ maxWidth: 780 }}>
      <button
        style={{ background: "none", border: "none", cursor: "pointer", color: "#1A56DB", fontWeight: 600, padding: "8px 0", fontSize: 14, marginBottom: 12 }}
        onClick={onBack}
      >← Back to list</button>

      {error && <p className="form-error">{error}</p>}

      {detail && (
        <>
          {/* ── Header ───────────────────────────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 22, color: "#F9FAFB" }}>{detail.name || "—"}</h2>
                <span style={{
                  background: entityType === "driver" ? "#DBEAFE" : "#EDE9FE",
                  color: entityType === "driver" ? "#1D4ED8" : "#7C3AED",
                  borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 700,
                }}>
                  {entityType === "driver" ? "🚗 Driver" : "🔧 Professional"}
                </span>
                {detail.status && (() => {
                  const s = REVIEW_STATUS_BADGE[detail.status] || REVIEW_STATUS_BADGE.inactive;
                  return (
                    <span style={{ background: s.bg, color: s.color, borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
                      {detail.status.replace("_", " ")}
                    </span>
                  );
                })()}
                {detail.is_online !== undefined && (
                  <span style={{ fontSize: 12, color: detail.is_online ? "#059669" : "#9CA3AF" }}>
                    {detail.is_online ? "🟢 Online" : "⚫ Offline"}
                  </span>
                )}
              </div>
              {detail.created_at && (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9CA3AF" }}>
                  Member since {new Date(detail.created_at).toLocaleDateString("en-US", { day: "2-digit", month: "long", year: "numeric" })}
                </p>
              )}
            </div>

            {/* Quick actions */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
                disabled={acting === "global"}
                onClick={() => handleGlobalDecision("active")}
              >✅ Activate</button>
              <button
                style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
                disabled={acting === "global"}
                onClick={() => handleGlobalDecision("suspended")}
              >✗ Suspend</button>
            </div>
          </div>

          {/* ── Identity ────────────────────────────────────────────────── */}
          <SectionTitle>Identity</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px 24px" }}>
            <ProfileField label="First name"    value={detail.first_name || "—"} />
            <ProfileField label="Last name"     value={detail.last_name  || "—"} />
            <ProfileField label="Date of birth" value={detail.date_of_birth || "—"} />
            <ProfileField label="Email"         value={detail.email || "—"} />
            <ProfileField label="Phone"         value={detail.phone || "—"} />
            {entityType === "driver" && (
              <ProfileField label="License No." value={detail.license_number || "—"} />
            )}
            {entityType === "professional" && detail.specialties && (
              <ProfileField label="Specialties" value={detail.specialties} />
            )}
          </div>

          {/* ── Stats (driver only) ─────────────────────────────────────── */}
          {entityType === "driver" && (
            <>
              <SectionTitle>Activity</SectionTitle>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 20px", minWidth: 110, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#1D4ED8" }}>{detail.total_trips ?? 0}</div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Completed trips</div>
                </div>
                <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "12px 20px", minWidth: 110, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#D97706" }}>
                    {detail.avg_rating != null ? `⭐ ${detail.avg_rating.toFixed(1)}` : "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                    Avg rating{detail.total_ratings ? ` (${detail.total_ratings})` : ""}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Vehicle (driver only) ───────────────────────────────────── */}
          {entityType === "driver" && (
            <>
              <SectionTitle>Vehicle</SectionTitle>
              {detail.vehicle ? (
                <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 3, color: "#111827", marginBottom: 6 }}>
                    {detail.vehicle.plate}
                  </div>
                  <div style={{ fontSize: 14, color: "#374151", marginBottom: 8 }}>
                    {[detail.vehicle.color, detail.vehicle.make, detail.vehicle.model, detail.vehicle.year].filter(Boolean).join(" · ") || "—"}
                  </div>
                  <span style={{ background: "#DBEAFE", color: "#1D4ED8", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                    {VEHICLE_CATEGORY_LABELS[detail.vehicle.category] ?? detail.vehicle.category}
                  </span>
                </div>
              ) : (
                <p style={{ color: "#9CA3AF", fontSize: 13 }}>No vehicle registered yet.</p>
              )}
            </>
          )}

          {/* ── History & Earnings ──────────────────────────────────────── */}
          <SectionTitle>{entityType === "driver" ? "Ride history & earnings" : "Interventions & earnings"}</SectionTitle>
          <HistoryEarningsSection token={token} entityId={entityId} entityType={entityType} />

          {/* ── Documents ───────────────────────────────────────────────── */}
          <SectionTitle>Documents ({detail.documents.length})</SectionTitle>

          {detail.documents.length === 0 && (
            <p className="muted-msg">No documents submitted yet.</p>
          )}

          {detail.documents.map((doc) => {
            const statusStyle = DOC_STATUS_COLORS[doc.status] || { bg: "#F3F4F6", color: "#374151" };
            const isPdf = doc.url?.startsWith("data:application/pdf") || doc.url?.toLowerCase().endsWith(".pdf");
            return (
              <div key={doc.document_id} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: 14 }}>{DOC_TYPE_LABELS[doc.type] ?? doc.type}</strong>
                  <span style={{ ...statusStyle, borderRadius: 4, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>
                    {DOC_STATUS_LABELS[doc.status] ?? doc.status}
                  </span>
                </div>
                <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {/* Type label */}
                  <span style={{ fontSize: 13, color: "#6B7280" }}>
                    {isPdf ? "📄 PDF" : "🖼 Image"}
                  </span>
                  {/* Preview button — opens modal */}
                  <button
                    onClick={() => setPreviewDoc({ url: doc.url, isPdf, label: DOC_TYPE_LABELS[doc.type] ?? doc.type })}
                    style={{ background: "#1D4ED8", color: "#fff", border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                  >
                    👁 Preview
                  </button>
                  {/* External link for non-base64 URLs */}
                  {!doc.url.startsWith("data:") && (
                    <a href={doc.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#1A56DB" }}>
                      Open ↗
                    </a>
                  )}
                  <span style={{ color: "#9CA3AF", fontSize: 12, marginLeft: 4 }}>
                    {new Date(doc.created_at).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </div>
                {doc.note_admin && (
                  <p style={{ background: "#FEF3C7", borderRadius: 4, padding: "6px 10px", fontSize: 13, margin: "0 0 8px" }}>
                    💬 {doc.note_admin}
                  </p>
                )}
                {doc.status !== "approved" && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      className="payout-note-input"
                      type="text"
                      placeholder="Admin note (optional)"
                      style={{ flex: "1 1 180px", minWidth: 120, maxWidth: 280 }}
                      value={notes[doc.document_id] ?? ""}
                      onChange={(e) => setNotes((p) => ({ ...p, [doc.document_id]: e.target.value }))}
                    />
                    <button className="payout-approve-btn"
                      disabled={acting === doc.document_id}
                      onClick={() => handleDocAction(doc.document_id, "approved")}>
                      ✅ Approve
                    </button>
                    <button style={{ background: "#FF8A4C", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}
                      disabled={acting === doc.document_id}
                      onClick={() => handleDocAction(doc.document_id, "needs_resubmission")}>
                      🔄 Redo
                    </button>
                    <button className="payout-reject-btn"
                      disabled={acting === doc.document_id}
                      onClick={() => handleDocAction(doc.document_id, "rejected")}>
                      ✗ Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Global decision (bottom) ─────────────────────────────────── */}
          <div style={{ borderTop: "2px solid #E5E7EB", paddingTop: 16, marginTop: 24 }}>
            <p style={{ color: "#6B7280", fontSize: 13, marginBottom: 12 }}>
              Activating the account allows the {entityType} to accept platform requests.
              Suspending blocks access until further review.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}
                disabled={acting === "global"}
                onClick={() => handleGlobalDecision("active")}
              >✅ Activate Account</button>
              <button
                style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}
                disabled={acting === "global"}
                onClick={() => handleGlobalDecision("suspended")}
              >✗ Suspend Account</button>
            </div>
          </div>
        </>
      )}
    </div>
    </>
  );
}


function OnboardingPanel({ token }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // { entity_id, entity_type }
  const [typeFilter, setTypeFilter] = useState("all"); // "all" | "driver" | "professional"

  const load = useCallback(() => {
    setLoading(true); setError(null);
    adminListOnboarding(token)
      .then(setList)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function handleBack() {
    setSelected(null);
    load();
  }

  if (selected) {
    return (
      <div className="documents-panel-admin">
        <UserReviewPanel
          token={token}
          entityId={selected.entity_id}
          entityType={selected.entity_type}
          onBack={handleBack}
        />
      </div>
    );
  }

  const filtered = typeFilter === "all" ? list : list.filter((r) => r.entity_type === typeFilter);

  return (
    <div className="documents-panel-admin">
      <div className="panel-header">
        <h2 className="panel-title">🆔 Onboarding Review</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["all", "All"], ["driver", "🚗 Drivers"], ["professional", "🔧 Professionals"]].map(([val, label]) => (
          <button key={val}
            onClick={() => setTypeFilter(val)}
            style={{
              background: typeFilter === val ? "#1A56DB" : "#F3F4F6",
              color: typeFilter === val ? "#fff" : "#374151",
              border: "none", borderRadius: 6, padding: "6px 14px",
              cursor: "pointer", fontWeight: 600, fontSize: 13,
            }}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}
      {loading && <div className="status loading">⏳ Loading…</div>}
      {!loading && filtered.length === 0 && (
        <p className="muted-msg">No pending onboarding requests{typeFilter !== "all" ? ` for ${typeFilter}s` : ""}.</p>
      )}

      {filtered.map((item) => {
        const isDriver = item.entity_type === "driver";
        const { doc_counts: dc } = item;
        return (
          <div key={item.entity_id} style={{
            border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 16px",
            marginBottom: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <strong style={{ fontSize: 14 }}>{item.name}</strong>
                <span style={{
                  background: isDriver ? "#DBEAFE" : "#EDE9FE",
                  color: isDriver ? "#1D4ED8" : "#7C3AED",
                  borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 600,
                }}>
                  {isDriver ? "🚗 Driver" : "🔧 Pro"}
                </span>
              </div>
              <div style={{ color: "#6B7280", fontSize: 12 }}>
                {item.email}
                {" · "}
                {dc.total === 0
                  ? "No documents yet"
                  : `${dc.total} doc${dc.total > 1 ? "s" : ""}`
                    + (dc.pending > 0 ? ` · ⏳ ${dc.pending} pending` : "")
                    + (dc.approved > 0 ? ` · ✅ ${dc.approved} ok` : "")
                    + (dc.needs_resubmission > 0 ? ` · 🔄 ${dc.needs_resubmission} redo` : "")
                    + (dc.rejected > 0 ? ` · ✗ ${dc.rejected} rejected` : "")
                }
              </div>
            </div>
            <div style={{ color: "#9CA3AF", fontSize: 12 }}>
              {new Date(item.created_at).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
            <button
              style={{
                background: "#1A56DB", color: "#fff", border: "none",
                borderRadius: 6, padding: "7px 16px", cursor: "pointer",
                fontWeight: 600, fontSize: 13, whiteSpace: "nowrap",
              }}
              onClick={() => setSelected(item)}
            >
              Review →
            </button>
          </div>
        );
      })}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Dashboard — tabbed navigation
// ---------------------------------------------------------------------------

// WS6 — Finance observability dashboard
const ALERT_COLORS = { critical: "#DC2626", warning: "#D97706", info: "#2563EB" };
const TX_KIND_LABELS = {
  payment: "💳 Payment",
  driver_payout: "🚗 Driver payout",
  professional_payout: "🔧 Pro payout",
  wallet_topup: "💰 Top-up",
};

function FinancePanel({ token }) {
  const [metrics, setMetrics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    Promise.all([
      adminFinanceMetrics(token).then(setMetrics).catch((e) => setError(e.message)),
      adminFinanceAlerts(token).then(setAlerts).catch(() => {}),
      adminFinanceTransactions(token, 30).then(setTxs).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading && !metrics) return <p style={{ color: "#9CA3AF" }}>⏳ Loading finance…</p>;
  if (error) return <p className="form-error">{error}</p>;
  if (!metrics) return null;

  const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const card = { background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: 14, minWidth: 150 };
  const lbl = { color: "#9CA3AF", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" };
  const big = { color: "#F9FAFB", fontSize: 22, fontWeight: 700 };
  const sub = { color: "#9CA3AF", fontSize: 12 };
  const row = { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1f2937" };
  const cell = { color: "#F9FAFB", fontSize: 14 };

  const p = metrics.payments, d = metrics.payouts.driver, pr = metrics.payouts.professional, tu = metrics.topups;

  return (
    <div>
      <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="section-title">💵 Finance</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {alerts.map((a) => (
            <div key={a.code} style={{ borderLeft: `4px solid ${ALERT_COLORS[a.level] || "#6B7280"}`, background: "#1f2937", padding: "8px 12px", borderRadius: 6, marginBottom: 6 }}>
              <span style={{ color: ALERT_COLORS[a.level] || "#fff", fontWeight: 700, textTransform: "uppercase", fontSize: 11 }}>{a.level}</span>
              <span style={{ color: "#F9FAFB", marginLeft: 8 }}>{a.message} ({a.count})</span>
            </div>
          ))}
        </div>
      )}

      {/* Metric cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={card}>
          <div style={lbl}>Payments</div>
          <div style={big}>{pct(p.success_rate)}</div>
          <div style={sub}>{p.paid} paid · {p.failed} failed · {p.refunded} refunded · {p.pending} pending</div>
        </div>
        <div style={card}>
          <div style={lbl}>Driver payouts</div>
          <div style={big}>{d.processed}</div>
          <div style={sub}>{d.approved} approved · {d.pending} pending · {d.failed} failed</div>
        </div>
        <div style={card}>
          <div style={lbl}>Pro payouts</div>
          <div style={big}>{pr.processed}</div>
          <div style={sub}>{pr.approved} approved · {pr.pending} pending · {pr.failed} failed</div>
        </div>
        <div style={card}>
          <div style={lbl}>Top-ups</div>
          <div style={big}>{tu.paid}</div>
          <div style={sub}>{tu.pending} pending · {tu.failed} failed</div>
        </div>
        <div style={card}>
          <div style={lbl}>Payout success</div>
          <div style={big}>{pct(metrics.payouts.success_rate)}</div>
        </div>
      </div>

      {/* Recent transactions */}
      <h3 style={{ color: "#F9FAFB", fontSize: 15, marginBottom: 8 }}>Recent transactions</h3>
      {txs.length === 0 && <p style={{ color: "#9CA3AF" }}>No transactions yet.</p>}
      {txs.map((t) => (
        <div key={`${t.kind}-${t.id}`} style={row}>
          <span style={cell}>{TX_KIND_LABELS[t.kind] || t.kind}</span>
          <span style={cell}>{formatUSD(t.amount_cents)}</span>
          <span style={{ ...cell, color: "#9CA3AF" }}>{t.status}</span>
          <span style={{ ...cell, color: "#6B7280", fontSize: 12 }}>
            {new Date(t.at).toLocaleDateString("en-US", { day: "2-digit", month: "short" })}
          </span>
        </div>
      ))}
    </div>
  );
}

const TABS = [
  { id: "stats",        label: "📊 Stats" },
  { id: "trips",        label: "🚕 Trips" },
  { id: "drivers",      label: "🧑‍✈️ Drivers" },
  { id: "live",         label: "🗺️ Live" },
  { id: "cities",       label: "🗺️ Zones" },
  { id: "analytics",    label: "📈 Analytics" },
  { id: "promos",       label: "🏷️ Promos" },
  { id: "payouts",      label: "💸 Payouts",      pendingKey: "payout_requests" },
  { id: "finance",      label: "💵 Finance" },
  { id: "ratings",      label: "⭐ Reviews" },
  { id: "documents",    label: "📄 Documents",    pendingKey: "documents" },
  { id: "onboarding",   label: "🆔 Onboarding",   pendingKey: "onboarding" },
  { id: "commission",   label: "💰 Commission" },
  { id: "applications", label: "📝 Applications" },
  { id: "flags",        label: "🚩 Feature Flags" },
  { id: "services",     label: "🔧 Services" },
  { id: "pricing",      label: "💵 Fares" },
  { id: "settings",     label: "⚙️ Settings" },
  { id: "users",        label: "👥 Users" },
  { id: "craft",        label: "🛠️ Craft" },
];

function Dashboard({ user, token, onLogout }) {
  const [activeTab, setActiveTab] = useState("stats");
  const [pendingCounts, setPendingCounts] = useState({ payout_requests: 0, documents: 0, onboarding: 0 });

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
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </header>
      <div className="status ok">✓ Signed in — <strong>{user.email}</strong></div>
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

      {activeTab === "stats"      && <StatsPanel   token={token} />}
      {activeTab === "trips"      && <TripsPanel   token={token} />}
      {activeTab === "drivers"    && <DriversPanel token={token} />}
      {activeTab === "promos"     && <PromoPanel       token={token} />}
      {activeTab === "payouts"    && <PayoutsPanel     token={token} />}
      {activeTab === "finance"    && <FinancePanel     token={token} />}
      {activeTab === "ratings"    && <RatingsPanel     token={token} />}
      {activeTab === "documents"  && <DocumentsPanel   token={token} />}
      {activeTab === "onboarding"   && <OnboardingPanel     token={token} />}
      {activeTab === "commission"   && <CommissionPanel    token={token} />}
      {activeTab === "applications" && <ApplicationsPanel  token={token} />}
      {activeTab === "live"         && <LiveMapPanel        token={token} />}
      {activeTab === "cities"       && <CitiesPanel          token={token} />}
      {activeTab === "analytics"    && <AnalyticsPanel       token={token} />}
      {activeTab === "flags"        && <FlagsPanel          token={token} />}
      {activeTab === "services"     && <ServicesPanel       token={token} />}
      {activeTab === "pricing"      && <PricingPanel        token={token} />}
      {activeTab === "settings"     && <SurgePanel          token={token} />}
      {activeTab === "users"        && <UsersPanel          token={token} />}
      {activeTab === "craft"        && <CraftPanel          token={token} />}

      <p className="footer">App: <strong>web-admin</strong> · Sprint 65 — User Identity Fields</p>
    </div>
  );
}

function AccessDenied({ role, onLogout }) {
  return (
    <div className="app">
      <h1>Ziza Admin</h1>
      <div className="status error">✗ Access denied — expected role: {REQUIRED_ROLE} · you have: {role}</div>
      <button className="logout-btn" onClick={onLogout}>Logout</button>
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
  }, [user]); // eslint-disable-line

  // Auto-logout when any API call receives a 401 (expired / invalid token)
  useEffect(() => {
    function handleAuthExpired() {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
    window.addEventListener("ziza:auth:expired", handleAuthExpired);
    return () => window.removeEventListener("ziza:auth:expired", handleAuthExpired);
  }, []);

  async function handleEmailLogin(email, password) {
    setLoginLoading(true); setLoginError(null);
    try {
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

  async function handleSignup(email, password, name, adminCode) {
    setLoginLoading(true); setLoginError(null);
    try {
      const { access_token } = firebaseEnabled
        ? await exchangeFirebaseToken(await signUpEmail(email, password), { adminCode, name })
        : await signup(email, password, name || null, adminCode);
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
