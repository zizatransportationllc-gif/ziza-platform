import { useEffect, useState, useCallback, useRef } from "react";
import {
  login, signup, exchangeFirebaseToken, fetchMe, registerUser, registerDriver,
  listAvailableTrips, getActiveTrip,
  acceptTrip, startTrip, completeTrip,
  getMyRating, getMyEarnings, getDriverBalance,
  getMyVehicle, registerVehicle,
  getDriverProfile, getProfile, updateProfile, setDriverOnline, listDriverTripHistory,
  listTripMessages, sendTripMessage,
  createPayoutRequest, listPayoutRequests,
  getConnectStatus, connectOnboard,
  submitDocument, listMyDocuments,
  listNotifications, getUnreadCount, markAllRead,
  listCategories,
  updateDriverLocation, getDriverLocation,
  registerDeviceToken,
} from "./api";
import { firebaseEnabled, signInWithGoogle, signUpEmail, signInEmail, firebaseSignOut } from "./auth";
import DriverMap from "./DriverMap";

const REQUIRED_ROLE = "driver";
const TOKEN_KEY = "ziza_token";
const POLL_MS = 5000;

// Sprint 21 — vehicle category constants
const VEHICLE_CATEGORIES = [
  { value: "economy", label: "🚗 Economy" },
  { value: "comfort", label: "🚙 Comfort" },
  { value: "premium", label: "🏎️ Premium" },
];

// Sprint 22 — New Jersey landmarks for location quick-pick
const NJ_LOCATIONS = {
  "Downtown Newark":  { lat: 40.7357, lng: -74.1724 },
  "Jersey City":      { lat: 40.7178, lng: -74.0431 },
  "Hoboken":          { lat: 40.7440, lng: -74.0324 },
  "Trenton":          { lat: 40.2171, lng: -74.7429 },
  "Hackensack":       { lat: 40.8859, lng: -74.0435 },
  "Princeton":        { lat: 40.3573, lng: -74.6672 },
  "Elizabeth":        { lat: 40.6640, lng: -74.2107 },
  "Newark Airport":   { lat: 40.6895, lng: -74.1745 },
};
const LOCATION_NAMES = Object.keys(NJ_LOCATIONS);

const STATUS_LABELS = {
  accepted:    "✓ Ride accepted — heading to customer",
  in_progress: "🚗 Ride in progress",
  completed:   "✅ Ride completed",
  cancelled:   "✗ Ride cancelled by customer",
};


function formatUSD(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({ onEmailLogin, onGoogleLogin, onSignup, error, loading }) {
  // Open the sign-up tab directly when the landing page links with ?signup=1
  const initTab = new URLSearchParams(window.location.search).get("signup") === "1"
    ? "signup"
    : "signin";
  const [tab, setTab] = useState(initTab);
  // Sign-in fields
  const [email, setEmail] = useState("driver@ziza.dev");
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
      <img src="/logo-driver.svg" alt="Ziza Driver" className="app-logo" />
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
          <p className="hint">Dev: driver@ziza.dev / ziza2024</p>
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
            <input type="tel" value={suPhone} onChange={(e) => setSuPhone(e.target.value)} placeholder="Phone number" />
            <button type="submit" disabled={loading}>{loading ? "Creating account…" : "Apply as Driver"}</button>
          </form>
          {(suError || error) && <p className="form-error">{suError || error}</p>}
          <p className="hint">After sign-up, complete your driver profile and vehicle registration to start receiving rides.</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active trip card — shown when driver has an ongoing ride
// ---------------------------------------------------------------------------

function ChatPanel({ token, tripId, accent = "#1D4ED8" }) {
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
      <div style={{ padding: "8px 12px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 14, color: "#111827" }}>💬 Chat with customer</div>
      <div style={{ maxHeight: 220, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {messages.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No messages yet.</p>}
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
      {trip.fare_cents && <div className="active-fare">{formatUSD(trip.fare_cents)}</div>}
      <div className="fare-meta">
        {trip.distance_km != null && <span>🛣️ {trip.distance_km.toFixed(1)} mi</span>}
        {trip.duration_min != null && <span>⏱️ ~{trip.duration_min} min</span>}
      </div>
      {error && <p className="form-error">{error}</p>}
      {trip.status === "accepted" && (
        <button className="action-btn start-btn" onClick={() => handleAction(startTrip)} disabled={busy}>
          {busy ? "…" : "🚦 Start Ride"}
        </button>
      )}
      {trip.status === "in_progress" && (
        <button className="action-btn complete-btn" onClick={() => handleAction(completeTrip)} disabled={busy}>
          {busy ? "…" : "🏁 Complete Ride"}
        </button>
      )}
      {(trip.status === "accepted" || trip.status === "in_progress") && (
        <ChatPanel token={token} tripId={trip.trip_id} accent="#1D4ED8" />
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
      <div className="rating-stats-label">My Rating</div>
      {total_ratings === 0 ? (
        <div className="rating-stats-empty">No ratings yet</div>
      ) : (
        <>
          <div className="rating-stars-row">{renderStars(average_stars)}</div>
          <div className="rating-avg">
            {average_stars !== null ? average_stars.toFixed(1) : "—"}
            <span className="rating-count"> / 5 · {total_ratings} review{total_ratings !== 1 ? "s" : ""}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Earnings card — Sprint 11 → Sprint 29 (net balance + commission)
// ---------------------------------------------------------------------------

function EarningsCard({ earnings, balance }) {
  if (!earnings) return null;
  const { total_cents, total_trips, today_cents, today_trips, week_cents, week_trips, recent_trips = [] } = earnings;

  return (
    <div className="earnings-card">
      <div className="earnings-label">My Earnings</div>
      <div className="earnings-total">{formatUSD(total_cents)}</div>
      <div className="earnings-count">{total_trips} ride{total_trips !== 1 ? "s" : ""} completed</div>

      {/* Sprint 29 — net balance breakdown */}
      {balance && (
        <div className="balance-breakdown">
          <div className="balance-row">
            <span className="balance-label">Gross earnings</span>
            <span className="balance-value">{formatUSD(balance.gains_bruts_cents)}</span>
          </div>
          <div className="balance-row balance-row--deduction">
            <span className="balance-label">Platform commission</span>
            <span className="balance-value balance-value--negative">- {formatUSD(balance.commission_cents)}</span>
          </div>
          {balance.retraits_cents > 0 && (
            <div className="balance-row balance-row--deduction">
              <span className="balance-label">Withdrawals</span>
              <span className="balance-value balance-value--negative">- {formatUSD(balance.retraits_cents)}</span>
            </div>
          )}
          <div className="balance-row balance-row--net">
            <span className="balance-label">Net available balance</span>
            <span className="balance-value balance-value--net">{formatUSD(balance.solde_net_cents)}</span>
          </div>
        </div>
      )}

      <div className="earnings-periods">
        <div className="earnings-period">
          <span className="period-label">Today</span>
          <span className="period-value">{formatUSD(today_cents)}</span>
          <span className="period-trips">{today_trips} ride{today_trips !== 1 ? "s" : ""}</span>
        </div>
        <div className="earnings-period">
          <span className="period-label">This week</span>
          <span className="period-value">{formatUSD(week_cents)}</span>
          <span className="period-trips">{week_trips} ride{week_trips !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Sprint 11 fix: recent trips list */}
      {recent_trips.length > 0 && (
        <div className="earnings-recent">
          <div className="earnings-recent-title">Last 10 rides</div>
          <div className="earnings-recent-list">
            {recent_trips.map((t) => (
              <div key={t.trip_id} className="earnings-recent-row">
                <div className="earnings-recent-left">
                  <span className="earnings-recent-fare">
                    {t.fare_cents != null ? formatUSD(t.fare_cents) : "—"}
                  </span>
                  <span className="earnings-recent-meta">
                    {t.distance_km != null && `🛣️ ${t.distance_km.toFixed(1)} mi`}
                    {t.duration_min != null && ` · ⏱️ ${t.duration_min} min`}
                  </span>
                </div>
                <span className="earnings-recent-date">
                  {new Date(t.completed_at).toLocaleDateString("en-US", {
                    day: "2-digit", month: "short",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {recent_trips.length === 0 && total_trips === 0 && (
        <p className="earnings-empty">No completed rides yet.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vehicle card — Sprint 12
// ---------------------------------------------------------------------------

function VehicleCard({ token, vehicle, onSaved }) {
  const [editing, setEditing] = useState(!vehicle);
  const [plate, setPlate]       = useState(vehicle?.plate ?? "");
  const [make, setMake]         = useState(vehicle?.make ?? "");
  const [model, setModel]       = useState(vehicle?.model ?? "");
  const [year, setYear]         = useState(vehicle?.year ?? "");
  const [color, setColor]       = useState(vehicle?.color ?? "");
  const [category, setCategory] = useState(vehicle?.category ?? "economy"); // Sprint 21
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const v = await registerVehicle(
        token, plate.trim(), make.trim() || null, model.trim() || null,
        year || null, color.trim() || null, category,
      );
      onSaved(v);
      setEditing(false);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  const categoryLabel = VEHICLE_CATEGORIES.find((c) => c.value === (vehicle?.category ?? "economy"))?.label ?? "🚗 Economy";

  if (!editing && vehicle) {
    return (
      <div className="vehicle-card">
        <div className="vehicle-label">My Vehicle</div>
        <div className="vehicle-plate">{vehicle.plate}</div>
        <div className="vehicle-meta">
          {[vehicle.color, vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" · ")}
        </div>
        <div className="vehicle-category-badge">{categoryLabel}</div>
        <button className="vehicle-edit-btn" onClick={() => setEditing(true)}>Edit</button>
      </div>
    );
  }

  return (
    <div className="vehicle-card vehicle-card-form">
      <div className="vehicle-label">{vehicle ? "Edit Vehicle" : "Register My Vehicle"}</div>
      <form className="vehicle-form" onSubmit={handleSave}>
        <input className="vehicle-input" placeholder="License Plate *" value={plate} onChange={(e) => setPlate(e.target.value)} required />
        <div className="vehicle-row">
          <input className="vehicle-input" placeholder="Make" value={make}  onChange={(e) => setMake(e.target.value)} />
          <input className="vehicle-input" placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="vehicle-row">
          <input className="vehicle-input" placeholder="Year" type="number" min="1980" max="2100" value={year} onChange={(e) => setYear(e.target.value)} />
          <input className="vehicle-input" placeholder="Color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        {/* Sprint 21: category selector */}
        <div className="vehicle-category-row">
          <span className="vehicle-category-label">Category</span>
          <div className="vehicle-category-btns">
            {VEHICLE_CATEGORIES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`vehicle-cat-btn ${category === value ? "vehicle-cat-btn-selected" : ""}`}
                onClick={() => setCategory(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="vehicle-form-actions">
          <button type="submit" className="action-btn accept-btn" disabled={saving}>{saving ? "…" : "✓ Save"}</button>
          {vehicle && <button type="button" className="logout-btn" onClick={() => setEditing(false)}>Cancel</button>}
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispatch list — pending trips
// ---------------------------------------------------------------------------

function AvailableTripsSection({ token, onTripAccepted }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const t = await listAvailableTrips(token);
      setTrips(t);
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

  return (
    <div className="available-section">
      <div className="available-header">
        <h2 className="section-title">Dispatch</h2>
        <span className="live-badge">● Live</span>
      </div>
      {error && <p className="form-error">{error}</p>}
      {loading && trips.length === 0 && (
        <div className="status loading">⏳ Loading…</div>
      )}
      {!loading && trips.length === 0 && (
        <div className="empty-state">No trips available right now.</div>
      )}
      <div className="trip-list">
        {trips.map((t) => (
          <div key={t.trip_id} className="trip-card">
            <div className="dispatch-tag tag-ride">🚕 Ride</div>
            {t.category && t.category !== "economy" && (
              <div className={`dispatch-category dispatch-cat-${t.category}`}>
                {VEHICLE_CATEGORIES.find((c) => c.value === t.category)?.label ?? t.category}
              </div>
            )}
            <div className="trip-card-fare">{t.fare_cents ? formatUSD(t.fare_cents) : "—"}</div>
            <div className="trip-card-meta">
              {t.distance_km != null && <span>🛣️ {t.distance_km.toFixed(1)} mi</span>}
              {t.duration_min != null && <span>⏱️ ~{t.duration_min} min</span>}
            </div>
            <button
              className="action-btn accept-btn"
              onClick={() => handleAcceptTrip(t.trip_id)}
              disabled={accepting === t.trip_id}
            >
              {accepting === t.trip_id ? "Accepting…" : "✓ Accept"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Driver trip history — Sprint 13
// ---------------------------------------------------------------------------

const TRIP_HISTORY_PAGE = 10;

function DriverTripHistory({ token }) {
  const [trips, setTrips] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (p = 0) => {
    setLoading(true); setError(null);
    try {
      const data = await listDriverTripHistory(token, TRIP_HISTORY_PAGE, p * TRIP_HISTORY_PAGE);
      setTrips(data);
      setPage(p);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  if (loading && trips.length === 0) return <div className="status loading">⏳ Loading…</div>;
  if (error) return <p className="form-error">{error}</p>;

  return (
    <div className="driver-history">
      <div className="available-header">
        <h2 className="section-title">Completed Rides</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>
      {trips.length === 0 && (
        <div className="empty-state">No completed rides yet.</div>
      )}
      <div className="trip-list">
        {trips.map((t) => (
          <div key={t.trip_id} className={`trip-card history-trip-${t.status}`}>
            <div className={`dispatch-tag ${t.status === "completed" ? "tag-ride" : "tag-cancelled"}`}>
              {t.status === "completed" ? "✅ Completed" : "✗ Cancelled"}
            </div>
            {t.fare_cents && <div className="trip-card-fare">{formatUSD(t.fare_cents)}</div>}
            <div className="trip-card-meta">
              {t.distance_km != null && <span>🛣️ {t.distance_km.toFixed(1)} mi</span>}
              {t.duration_min != null && <span>⏱️ {t.duration_min} min</span>}
              <span>{new Date(t.updated_at).toLocaleDateString("en-US", { day: "2-digit", month: "short" })}</span>
            </div>
          </div>
        ))}
      </div>
      {(trips.length === TRIP_HISTORY_PAGE || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={trips.length < TRIP_HISTORY_PAGE || loading}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payout Section — Sprint 15
// ---------------------------------------------------------------------------

const PAYOUT_STATUS_LABELS = {
  pending:  "⏳ Pending",
  approved: "✅ Approved",
  rejected: "✗ Rejected",
};

function PayoutSection({ token }) {
  const [amount, setAmount]   = useState("");
  const [payouts, setPayouts] = useState([]);
  const [available, setAvailable] = useState(null); // disponible_cents (cents)
  const [connect, setConnect] = useState(null); // { onboarded, payouts_enabled }
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      listPayoutRequests(token).then(setPayouts).catch(() => {}),
      getDriverBalance(token)
        .then((b) => setAvailable(b.disponible_cents ?? 0))
        .catch(() => {}),
      getConnectStatus(token).then(setConnect).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const overBalance = available != null && Number(amount) > available;
  const payoutsReady = connect && connect.payouts_enabled;

  async function handleOnboard() {
    try {
      const r = await connectOnboard(token);
      if (r.onboarding_url) window.open(r.onboarding_url, "_blank", "noopener");
    } catch (e) { setError(e.message); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    if (overBalance) {
      setError("Amount exceeds your available balance.");
      return;
    }
    setSubmitting(true); setError(null); setSuccess(null);
    try {
      await createPayoutRequest(token, Number(amount));
      setAmount("");
      setSuccess("Withdrawal request submitted!");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="payout-section">
      <h3 className="section-title">💰 Withdrawal Requests</h3>

      {connect && !payoutsReady && (
        <div className="payout-onboard-banner" style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <p style={{ margin: "0 0 8px" }}>
            ⚠️ To receive withdrawals, set up your payout account.
          </p>
          <button type="button" className="payout-submit-btn" onClick={handleOnboard}>
            Set up payouts →
          </button>
        </div>
      )}

      {available != null && (
        <p className="payout-available">
          Available to withdraw: <strong>{formatUSD(available)}</strong>
        </p>
      )}

      <form className="payout-form" onSubmit={handleSubmit}>
        <input
          className="payout-amount-input"
          type="number"
          min="1"
          step="100"
          max={available ?? undefined}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount in cents (e.g. 50000 = $500)"
          required
        />
        <button
          className="payout-submit-btn"
          type="submit"
          disabled={submitting || overBalance || !available}
        >
          {submitting ? "Sending…" : "Request Withdrawal"}
        </button>
      </form>
      {overBalance && (
        <p className="payout-err">Amount exceeds your available balance.</p>
      )}
      {success && <p className="payout-success">{success}</p>}
      {error   && <p className="payout-err">{error}</p>}

      <div className="payout-list">
        {loading && <p className="loading-msg">Loading…</p>}
        {!loading && payouts.length === 0 && (
          <p className="payout-empty">No withdrawal requests yet.</p>
        )}
        {payouts.map((p) => (
          <div key={p.payout_id} className={`payout-item payout-${p.status}`}>
            <div className="payout-item-main">
              <span className="payout-amount">{formatUSD(p.amount_cents)}</span>
              <span className={`payout-status payout-status-${p.status}`}>
                {PAYOUT_STATUS_LABELS[p.status] ?? p.status}
              </span>
            </div>
            {p.note_admin && (
              <p className="payout-note">💬 {p.note_admin}</p>
            )}
            <p className="payout-date">
              {new Date(p.created_at).toLocaleDateString("en-US", {
                day: "2-digit", month: "short", year: "numeric",
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents section — Sprint 58
// ---------------------------------------------------------------------------

const DOCUMENT_TYPE_LABELS = {
  license:      "🪪 Driver's License",
  insurance:    "🛡️ Vehicle Insurance",
  registration: "📋 Vehicle Registration",
  id_card:      "🪪 Government ID",
};

const DOCUMENT_STATUS_LABELS = {
  pending:            "⏳ Pending",
  approved:           "✅ Approved",
  rejected:           "✗ Rejected",
  needs_resubmission: "🔄 Resubmit Required",
};

const DOCUMENT_TYPES = ["license", "insurance", "registration", "id_card"];

const ONBOARDING_STEPS = [
  "Account Created",
  "Documents Submitted",
  "Under Review",
  "Account Approved",
];

function OnboardingProgress({ docs, entityStatus }) {
  const hasAnyDoc     = docs.length > 0;
  const hasActionItem = docs.some((d) => d.status === "rejected" || d.status === "needs_resubmission");
  let currentStep = 1;
  if (hasAnyDoc)                   currentStep = 2;
  if (hasAnyDoc && !hasActionItem) currentStep = 3;
  if (entityStatus === "active")   currentStep = 4;

  return (
    <div className="onboarding-stepper">
      {ONBOARDING_STEPS.map((label, i) => {
        const n    = i + 1;
        const done = n < currentStep;
        const cur  = n === currentStep;
        return (
          <div key={n} className="stepper-step">
            <div className={`stepper-circle ${done ? "circle-done" : cur ? "circle-active" : "circle-todo"}`}>
              {done ? "✓" : n}
            </div>
            <span className={`stepper-label ${done || cur ? "label-active" : "label-todo"}`}>{label}</span>
            {i < ONBOARDING_STEPS.length - 1 && (
              <div className={`stepper-line ${done ? "line-done" : "line-todo"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DocumentsSection({ token, driverStatus = "pending_docs" }) {
  const [docs, setDocs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [docType, setDocType]       = useState("license");
  const [preview, setPreview]       = useState(null);   // base64 data URL
  const [fileName, setFileName]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]       = useState(null);
  const [error, setError]           = useState(null);

  const loadDocs = useCallback(() => {
    setLoading(true);
    listMyDocuments(token)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const actionDocs = docs.filter((d) => d.status === "rejected" || d.status === "needs_resubmission");

  function handleResubmit(type) {
    setDocType(type);
    setPreview(null);
    setFileName("");
    setSuccess(null);
    setError(null);
  }

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
    if (!preview) { setError("Please capture or select a document first."); return; }
    setSubmitting(true); setError(null); setSuccess(null);
    try {
      await submitDocument(token, docType, preview);
      setPreview(null); setFileName("");
      setSuccess("✓ Document submitted for review.");
      loadDocs();
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="documents-section">
      <h3 className="doc-title">📄 My KYC Documents</h3>

      {!loading && <OnboardingProgress docs={docs} entityStatus={driverStatus} />}

      {actionDocs.length > 0 && (
        <div className="doc-action-banner">
          <strong>⚠️ Action Required</strong>
          <p>{actionDocs.length} document{actionDocs.length > 1 ? "s" : ""} need{actionDocs.length === 1 ? "s" : ""} your attention — please re-upload below.</p>
        </div>
      )}

      {!loading && docs.length > 0 && actionDocs.length === 0 && driverStatus !== "active" && (
        <div className="doc-review-banner">
          ⏳ All documents submitted — your account is under admin review. You will be notified once approved.
        </div>
      )}

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
            <input type="file" accept="image/*,.pdf,application/pdf" hidden onChange={handleFileChange} />
          </label>
        </div>
        {preview && (
          preview.startsWith("data:image/")
            ? (
              <div className="doc-preview-wrap">
                <img src={preview} className="doc-preview-img" alt="Document preview" />
                <span className="doc-file-name">{fileName}</span>
              </div>
            ) : (
              <div className="doc-pdf-selected">
                <span className="doc-pdf-icon">📄</span>
                <span className="doc-file-name">{fileName}</span>
              </div>
            )
        )}
        {success && <p className="doc-success">{success}</p>}
        {error   && <p className="doc-err">{error}</p>}
        <button type="submit" className="doc-submit-btn" disabled={submitting || !preview}>
          {submitting ? "Sending…" : "📤 Submit Document"}
        </button>
      </form>

      <div className="doc-list">
        {loading && <p className="loading-msg">Loading…</p>}
        {!loading && docs.length === 0 && (
          <p className="doc-empty">No documents submitted yet.</p>
        )}
        {docs.map((d) => (
          <div key={d.document_id} className={`doc-item doc-${d.status}`}>
            <div className="doc-item-main">
              <span className="doc-type">{DOCUMENT_TYPE_LABELS[d.type] ?? d.type}</span>
              <span className={`doc-status doc-status-${d.status}`}>
                {DOCUMENT_STATUS_LABELS[d.status] ?? d.status}
              </span>
            </div>
            {d.note_admin && <p className="doc-note">💬 {d.note_admin}</p>}
            {(d.status === "rejected" || d.status === "needs_resubmission") ? (
              <button
                className="doc-resubmit-btn"
                type="button"
                onClick={() => handleResubmit(d.type)}
              >
                🔄 Re-upload {DOCUMENT_TYPE_LABELS[d.type] ?? d.type}
              </button>
            ) : (
              <button
                className="doc-replace-btn"
                type="button"
                onClick={() => handleResubmit(d.type)}
              >
                ↩ Replace
              </button>
            )}
            <p className="doc-date">
              {new Date(d.created_at).toLocaleDateString("en-US", {
                day: "2-digit", month: "short", year: "numeric",
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications section — Sprint 18
// ---------------------------------------------------------------------------

const DRIVER_NOTIF_ICONS = {
  document_approved: "✅",
  document_rejected: "❌",
  trip_accepted:     "🚗",
  trip_completed:    "✅",
};

const DRIVER_NOTIF_PAGE = 10;

function DriverNotificationsSection({ token, onRead }) {
  const [notifs, setNotifs] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const data = await listNotifications(token, DRIVER_NOTIF_PAGE, p * DRIVER_NOTIF_PAGE);
      setNotifs(data); setPage(p);
    } catch (_) {}
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
        <h3 className="section-title">🔔 Notifications</h3>
        {unreadCount > 0 && (
          <button className="notif-mark-btn" onClick={handleMarkAll} disabled={marking}>
            {marking ? "…" : `Mark all read (${unreadCount})`}
          </button>
        )}
      </div>
      {loading && <p className="muted">⏳ Loading…</p>}
      {!loading && notifs.length === 0 && <p className="muted">No notifications.</p>}
      <div className="notif-list">
        {notifs.map((n) => (
          <div key={n.notification_id} className={`notif-item ${n.read ? "notif-read" : "notif-unread"}`}>
            <div className="notif-item-header">
              <span className="notif-icon">{DRIVER_NOTIF_ICONS[n.type] ?? "🔔"}</span>
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
      {(notifs.length === DRIVER_NOTIF_PAGE || page > 0) && (
        <div className="history-pagination">
          <button className="page-btn-sm" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info-sm">Page {page + 1}</span>
          <button className="page-btn-sm" onClick={() => load(page + 1)} disabled={notifs.length < DRIVER_NOTIF_PAGE || loading}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Driver location section — Sprint 22
// ---------------------------------------------------------------------------

function LocationSection({ token }) {
  const [landmark, setLandmark] = useState(LOCATION_NAMES[0]);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [useGps, setUseGps] = useState(false);
  const [current, setCurrent] = useState(null); // { lat, lng, updated_at }
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Load current location on mount
  useEffect(() => {
    getDriverLocation(token).then(setCurrent).catch(() => {});
  }, [token]);

  async function push(lat, lng) {
    setPushing(true); setError(null); setSuccess(false);
    try {
      const loc = await updateDriverLocation(token, lat, lng);
      setCurrent(loc);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) { setError(e.message); }
    finally { setPushing(false); }
  }

  function handleLandmark(e) {
    setLandmark(e.target.value);
    setManualLat(""); setManualLng("");
  }

  async function handlePushLandmark() {
    const c = NJ_LOCATIONS[landmark];
    await push(c.lat, c.lng);
  }

  async function handlePushManual(e) {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) { setError("Invalid coordinates"); return; }
    await push(lat, lng);
  }

  async function handleGps() {
    if (!navigator.geolocation) { setError("Geolocation not available"); return; }
    setUseGps(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        await push(coords.latitude, coords.longitude);
        setUseGps(false);
      },
      () => { setError("Unable to get GPS position"); setUseGps(false); },
      { timeout: 10000 },
    );
  }

  return (
    <div className="location-section">
      <h3 className="section-title">📍 My Location</h3>

      {current && (
        <div className="location-current">
          <span className="location-current-dot">●</span>
          <span>{current.lat.toFixed(4)}, {current.lng.toFixed(4)}</span>
          <span className="location-current-time">
            {new Date(current.updated_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}
      {!current && <p className="muted">No location recorded.</p>}

      {/* Interactive map — tap to update position */}
      <DriverMap
        lat={current?.lat ?? null}
        lng={current?.lng ?? null}
        onMapClick={(lat, lng) => push(lat, lng)}
        activeTrip={null}
      />

      {/* Quick-pick from NJ landmarks */}
      <div className="location-row">
        <select
          className="location-select"
          value={landmark}
          onChange={handleLandmark}
        >
          {LOCATION_NAMES.map((n) => <option key={n}>{n}</option>)}
        </select>
        <button
          className="location-push-btn"
          onClick={handlePushLandmark}
          disabled={pushing}
        >
          {pushing ? "…" : "📍 Update Location"}
        </button>
      </div>

      {/* GPS button */}
      <button
        className="location-gps-btn"
        onClick={handleGps}
        disabled={pushing || useGps}
      >
        {useGps ? "⏳ Getting GPS…" : "🛰️ Use My GPS Location"}
      </button>

      {/* Manual coordinates (advanced) */}
      <details className="location-manual">
        <summary className="location-manual-toggle">Manual coordinates</summary>
        <form className="location-manual-form" onSubmit={handlePushManual}>
          <input
            className="location-coord-input"
            type="number" step="0.0001" placeholder="Latitude"
            value={manualLat} onChange={(e) => setManualLat(e.target.value)}
          />
          <input
            className="location-coord-input"
            type="number" step="0.0001" placeholder="Longitude"
            value={manualLng} onChange={(e) => setManualLng(e.target.value)}
          />
          <button type="submit" className="location-push-btn" disabled={pushing}>
            {pushing ? "…" : "OK"}
          </button>
        </form>
      </details>

      {error   && <p className="form-error" style={{ marginTop: "8px" }}>{error}</p>}
      {success && <p className="location-success">✓ Location updated</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile section — Sprint 66 (personal identity editing)
// ---------------------------------------------------------------------------

function ProfileSection({ token }) {
  const [profile, setProfile] = useState(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
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
        phone: phone || null,
      });
      setProfile(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (loading) return <p style={{ opacity: 0.7 }}>⏳ Loading profile…</p>;
  if (error && !profile) return <p className="form-error">{error}</p>;

  const lblStyle = { display: "block", marginBottom: 12, fontSize: 13, fontWeight: 600 };
  const inStyle = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 };

  return (
    <div className="card" style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>👤 My Profile</h3>
      {profile && (
        <p style={{ fontSize: 13, opacity: 0.8, marginTop: -6 }}>✉️ {profile.email} · {profile.role}</p>
      )}
      <form onSubmit={handleSave}>
        <label style={lblStyle}>First name
          <input style={inStyle} type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={64} placeholder="First name" />
        </label>
        <label style={lblStyle}>Last name
          <input style={inStyle} type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={64} placeholder="Last name" />
        </label>
        <label style={lblStyle}>Date of birth
          <input style={inStyle} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </label>
        <label style={lblStyle}>Phone
          <input style={inStyle} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} placeholder="+1 (201) 555-0000" />
        </label>
        {error && <p className="form-error">{error}</p>}
        {success && <p style={{ color: "#059669", fontWeight: 600 }}>✓ Profile updated</p>}
        <button type="submit" className="btn-primary" disabled={saving} style={{ marginTop: 4 }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ user, token, onLogout }) {
  const [activeTrip, setActiveTrip] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [ratingStats, setRatingStats] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [vehicle, setVehicle] = useState(undefined); // undefined = loading, null = none
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [tab, setTab] = useState("dispatch"); // "dispatch" | "history" | "payouts" | "documents" | "notifications" | "location"
  const [unreadCount, setUnreadCount] = useState(0);
  const [balance, setBalance] = useState(null); // Sprint 29 — net balance
  const [driverStatus, setDriverStatus] = useState("pending_docs"); // Sprint 54 — safe default: lock until profile confirmed

  const refreshUnread = useCallback(() => {
    getUnreadCount(token).then((d) => setUnreadCount(d.count)).catch(() => {});
  }, [token]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);
  useEffect(() => { refreshUnread(); }, [tab, refreshUnread]);

  // On mount: parallel fetch
  useEffect(() => {
    Promise.all([
      getActiveTrip(token).then(({ trip }) => { setActiveTrip(trip); }),
      getMyRating(token).then(setRatingStats).catch(() => {}),
      getMyEarnings(token).then(setEarnings).catch(() => {}),
      getDriverBalance(token).then(setBalance).catch(() => {}), // Sprint 29
      getMyVehicle(token).then(setVehicle).catch(() => setVehicle(null)),
      getDriverProfile(token).then((p) => { setIsOnline(p.is_online); setDriverStatus(p.status || "pending_docs"); }).catch(() => {}),
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
    getDriverBalance(token).then(setBalance).catch(() => {}); // Sprint 29
  }

  async function handleToggleOnline() {
    setTogglingOnline(true);
    try {
      const result = await setDriverOnline(token, !isOnline);
      setIsOnline(result.is_online);
    } catch (_) { /* swallow */ }
    finally { setTogglingOnline(false); }
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

  const hasActive = activeTrip && !["completed", "cancelled"].includes(activeTrip.status);

  if (!initialized) {
    return (
      <div className="app">
        <div className="status loading">⏳ Loading…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="dash-header">
        <h1>Ziza Driver</h1>
        <div className="dash-header-right">
          <button
            className={`bell-btn ${unreadCount > 0 ? "bell-btn-active" : ""}`}
            onClick={() => setTab("notifications")}
            title="Notifications"
          >
            🔔{unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
          </button>
          <button className="logout-btn" onClick={onLogout}>Sign Out</button>
        </div>
      </header>
      <div className="status ok">✓ Signed in — <strong>{user.email}</strong></div>
      <div className="role-badge">{user.role} · {user.provider}</div>

      {/* Online/Offline toggle — locked while pending_docs */}
      <button
        className={`online-toggle ${driverStatus === "pending_docs" ? "online-locked" : isOnline ? "online" : "offline"}`}
        onClick={handleToggleOnline}
        disabled={togglingOnline || driverStatus === "pending_docs"}
        title={driverStatus === "pending_docs" ? "Account pending verification — submit your documents to unlock" : undefined}
      >
        <span className="online-dot" />
        {togglingOnline ? "…" : driverStatus === "pending_docs" ? "🔒 Locked" : isOnline ? "Online" : "Offline"}
      </button>

      <EarningsCard earnings={earnings} balance={balance} />
      <RatingStats stats={ratingStats} />

      {/* Active trip always shown regardless of tab */}
      {hasActive ? (
        <ActiveTripCard token={token} trip={activeTrip} onUpdate={handleTripUpdate} />
      ) : (
        <>
          {/* Tabs */}
          <div className="driver-tabs">
            <button
              className={`driver-tab ${tab === "dispatch" ? "active" : ""}`}
              onClick={() => setTab("dispatch")}
            >
              🚕 Dispatch
            </button>
            <button
              className={`driver-tab ${tab === "vehicle" ? "active" : ""}`}
              onClick={() => setTab("vehicle")}
            >
              🚗 Vehicle
            </button>
            <button
              className={`driver-tab ${tab === "profile" ? "active" : ""}`}
              onClick={() => setTab("profile")}
            >
              👤 Profile
            </button>
            <button
              className={`driver-tab ${tab === "history" ? "active" : ""}`}
              onClick={() => setTab("history")}
            >
              📋 History
            </button>
            <button
              className={`driver-tab ${tab === "payouts" ? "active" : ""}`}
              onClick={() => setTab("payouts")}
            >
              💰 Withdrawals
            </button>
            <button
              className={`driver-tab ${tab === "documents" ? "active" : ""}`}
              onClick={() => setTab("documents")}
            >
              📄 Documents
            </button>
            <button
              className={`driver-tab ${tab === "notifications" ? "active" : ""}`}
              onClick={() => setTab("notifications")}
            >
              🔔{unreadCount > 0 && <span className="tab-badge-sm">{unreadCount}</span>}
            </button>
            <button
              className={`driver-tab ${tab === "location" ? "active" : ""}`}
              onClick={() => setTab("location")}
            >
              📍
            </button>
          </div>

          {/* Sprint 54 — KYC pending gate */}
          {driverStatus === "pending_docs" && (
            <div className="kyc-pending-banner">
              <div className="kyc-pending-icon">🔒</div>
              <div>
                <strong>Account pending verification</strong>
                <p>Submit your documents below. Access to trips will be unlocked once an admin approves your documents.</p>
              </div>
              {tab !== "documents" && (
                <button className="btn-kyc-docs" onClick={() => setTab("documents")}>📄 Submit Documents →</button>
              )}
            </div>
          )}

          {tab === "dispatch" && (
            driverStatus === "pending_docs" ? (
              <div className="offline-notice">
                <div className="offline-icon">📋</div>
                <p>Document verification required.</p>
                <p className="offline-sub">Please submit your documents in the Documents tab to unlock the dispatch marketplace.</p>
              </div>
            ) : isOnline ? (
              <AvailableTripsSection
                token={token}
                onTripAccepted={setActiveTrip}
              />
            ) : (
              <div className="offline-notice">
                <div className="offline-icon">📴</div>
                <p>You are offline.</p>
                <p className="offline-sub">Go online to see available missions.</p>
              </div>
            )
          )}

          {tab === "vehicle"       && <VehicleCard token={token} vehicle={vehicle} onSaved={setVehicle} />}
          {tab === "profile"       && <ProfileSection token={token} />}
          {tab === "history"       && <DriverTripHistory token={token} />}
          {tab === "payouts"       && <PayoutSection token={token} />}
          {tab === "documents"     && <DocumentsSection token={token} driverStatus={driverStatus} />}
          {tab === "notifications" && <DriverNotificationsSection token={token} onRead={refreshUnread} />}
          {tab === "location"      && <LocationSection token={token} />}
        </>
      )}

      <p className="footer">App: <strong>web-driver</strong> · Sprint 64 — Profile Fields</p>
    </div>
  );
}

function AccessDenied({ role, onLogout }) {
  return (
    <div className="app">
      <h1>Ziza Driver</h1>
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

  // After login: upsert user row + driver profile
  useEffect(() => {
    if (!user || user.role !== REQUIRED_ROLE) return;
    registerUser(token)
      .then(() => registerDriver(token))
      .catch(() => {});
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
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: undefined,
        }).catch(() => null);
        const deviceToken = sub ? sub.endpoint : `web-driver-${user.user_id}`;
        await registerDeviceToken(token, deviceToken, "web");
      } catch (_) {
        // Non-blocking
      }
    }).catch(() => {});
  }, [user]);

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
