import { useEffect, useState, useCallback } from "react";
import {
  login, signup, fetchMe, registerUser, registerProfessional,
  getMyProfile, updateMyProfile,
  listOpenRequests, getCraftRequest,
  submitBid, getMyBids,
  submitDocument, listMyDocuments,
  listNotifications, getUnreadCount, markAllRead,
  registerDeviceToken,
  formatUSD,
} from "./api";

const REQUIRED_ROLE = "professional";
const TOKEN_KEY = "ziza_craft_token";
const POLL_MS = 6000;

const CATEGORY_LABELS = {
  breakdown:   "🔧 Breakdown",
  flat_tyre:   "🔴 Flat Tire",
  tow:         "🚛 Tow Truck",
  fuel:        "⛽ Out of Fuel",
  lockout:     "🔑 Lockout",
  battery:     "🔋 Battery",
  accident:    "🚨 Accident",
  diagnostics: "🔍 Diagnostics",
  other:       "🛠️ Other",
};

// Skills available to professionals — identical to customer problem categories
// so a customer's request always finds a professional with the right skill.
const ALL_SKILLS = [
  { key: "breakdown",   label: "🔧 Breakdown",    desc: "Car won't start / general breakdown" },
  { key: "flat_tyre",   label: "🔴 Flat Tire",     desc: "Punctured or flat tire replacement" },
  { key: "tow",         label: "🚛 Tow Truck",     desc: "Towing to a garage or safe location" },
  { key: "fuel",        label: "⛽ Out of Fuel",   desc: "Emergency fuel delivery" },
  { key: "lockout",     label: "🔑 Lockout",       desc: "Keys locked inside the vehicle" },
  { key: "battery",     label: "🔋 Battery",       desc: "Jump-start or battery replacement" },
  { key: "accident",    label: "🚨 Accident",      desc: "Post-accident assistance & scene management" },
  { key: "diagnostics", label: "🔍 Diagnostics",   desc: "Electronic / OBD on-site diagnostics" },
  { key: "other",       label: "🛠️ Other",        desc: "Any other vehicle intervention" },
];

const BID_STATUS_LABELS = {
  pending:  "⏳ Pending",
  accepted: "✅ Accepted",
  rejected: "✗ Rejected",
};

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

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({ onLogin, onSignup, error, loading }) {
  const [tab, setTab] = useState("signin");
  // Sign-in fields
  const [email, setEmail] = useState("professional@ziza.dev");
  const [password, setPassword] = useState("ziza2024");
  // Sign-up fields
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suName, setSuName] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suError, setSuError] = useState(null);

  function handleSignup(e) {
    e.preventDefault();
    setSuError(null);
    if (suPassword !== suConfirm) { setSuError("Passwords do not match"); return; }
    if (suPassword.length < 6) { setSuError("Password must be at least 6 characters"); return; }
    onSignup(suEmail, suPassword, suName, suPhone);
  }

  return (
    <div className="app">
      <h1>Ziza Craft</h1>
      <p className="subtitle">Sprint 49 — Professional Dashboard</p>
      <div className="auth-tabs">
        <button className={`auth-tab${tab === "signin" ? " active" : ""}`} onClick={() => setTab("signin")}>Sign In</button>
        <button className={`auth-tab${tab === "signup" ? " active" : ""}`} onClick={() => setTab("signup")}>Join as Pro</button>
      </div>
      {tab === "signin" ? (
        <>
          <form className="login-form" onSubmit={(e) => { e.preventDefault(); onLogin(email, password); }}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
            <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign In"}</button>
          </form>
          {error && <p className="form-error">{error}</p>}
          <p className="hint">Dev: professional@ziza.dev / ziza2024</p>
        </>
      ) : (
        <>
          <form className="login-form" onSubmit={handleSignup}>
            <input type="email" value={suEmail} onChange={(e) => setSuEmail(e.target.value)} placeholder="Email address" required />
            <input type="password" value={suPassword} onChange={(e) => setSuPassword(e.target.value)} placeholder="Password (min. 6 characters)" required />
            <input type="password" value={suConfirm} onChange={(e) => setSuConfirm(e.target.value)} placeholder="Confirm password" required />
            <input type="text" value={suName} onChange={(e) => setSuName(e.target.value)} placeholder="Full name" />
            <input type="tel" value={suPhone} onChange={(e) => setSuPhone(e.target.value)} placeholder="Phone number" />
            <button type="submit" disabled={loading}>{loading ? "Creating account…" : "Join as Professional"}</button>
          </form>
          {(suError || error) && <p className="form-error">{suError || error}</p>}
          <p className="hint">After sign-up, complete your professional profile to receive service requests.</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Request detail + bid form
// ---------------------------------------------------------------------------

function RequestDetail({ token, requestId, onBack }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Bid form state
  const [priceDollars, setPriceDollars] = useState("");
  const [etaMin, setEtaMin] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bidSuccess, setBidSuccess] = useState(false);
  const [bidError, setBidError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getCraftRequest(token, requestId)
      .then(setRequest)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, requestId]);

  async function handleBid(e) {
    e.preventDefault();
    if (!priceDollars || !etaMin) return;
    setSubmitting(true); setBidError(null); setBidSuccess(false);
    try {
      await submitBid(
        token,
        requestId,
        Math.round(parseFloat(priceDollars) * 100),
        parseInt(etaMin, 10),
        note.trim() || null,
      );
      setBidSuccess(true);
      setPriceDollars(""); setEtaMin(""); setNote("");
    } catch (err) { setBidError(err.message); }
    finally { setSubmitting(false); }
  }

  if (loading) return <div className="status loading">⏳ Loading request…</div>;
  if (error)   return <p className="form-error">{error}</p>;
  if (!request) return null;

  return (
    <div>
      <button className="detail-back-btn" onClick={onBack}>← Back to requests</button>

      <div className="detail-card">
        <div className="detail-category">
          {CATEGORY_LABELS[request.category] ?? request.category}
        </div>
        <p className="detail-description">{request.description}</p>
        <div className="detail-meta">
          {request.address && <span>📍 {request.address}</span>}
          {request.distance_km != null && (
            <span>🛣️ {request.distance_km.toFixed(1)} km away</span>
          )}
          {request.bid_deadline && (
            <span style={{ color: "var(--color-warning)" }}>
              ⏱ Deadline: {new Date(request.bid_deadline).toLocaleString("en-US")}
            </span>
          )}
          <span style={{ color: "var(--color-muted)" }}>
            Posted: {new Date(request.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
          </span>
        </div>
      </div>

      {bidSuccess ? (
        <p className="bid-success">✅ Bid submitted successfully!</p>
      ) : (
        <div className="bid-form">
          <h3>💰 Submit Your Bid</h3>
          <form onSubmit={handleBid}>
            <label>Price (USD)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              placeholder="e.g. 85.00"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              required
            />
            <label>ETA (minutes)</label>
            <input
              type="number"
              min="1"
              max="480"
              placeholder="e.g. 30"
              value={etaMin}
              onChange={(e) => setEtaMin(e.target.value)}
              required
            />
            <label>Note (optional)</label>
            <textarea
              placeholder="Any relevant details for the customer…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
            {bidError && <p className="form-error">{bidError}</p>}
            <button className="bid-submit-btn" type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "✓ Submit Bid"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open requests list
// ---------------------------------------------------------------------------

const REQUESTS_PAGE = 10;

function OpenRequestsSection({ token, isOnline }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const data = await listOpenRequests(token, 40.7357, -74.1724, REQUESTS_PAGE, p * REQUESTS_PAGE);
      setRequests(data);
      setPage(p);
    } catch (_) { /* silent */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!isOnline) return;
    load(0);
    const id = setInterval(() => load(0), POLL_MS);
    return () => clearInterval(id);
  }, [load, isOnline]);

  if (selectedId) {
    return (
      <RequestDetail
        token={token}
        requestId={selectedId}
        onBack={() => { setSelectedId(null); load(page); }}
      />
    );
  }

  if (!isOnline) {
    return (
      <div className="offline-notice">
        <div className="offline-icon">📴</div>
        <p>You are offline.</p>
        <p className="offline-sub">Go available to see nearby requests.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">🛠️ Open Requests</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="live-badge">● Live</span>
          <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
        </div>
      </div>

      {loading && requests.length === 0 && (
        <div className="empty-state">⏳ Loading…</div>
      )}
      {!loading && requests.length === 0 && (
        <div className="empty-state">No open requests nearby.</div>
      )}

      <div className="request-list">
        {requests.map((req) => (
          <div key={req.request_id} className="request-card" onClick={() => setSelectedId(req.request_id)}>
            <div className="request-card-header">
              <span className="category-chip">{CATEGORY_LABELS[req.category] ?? req.category}</span>
              {req.distance_km != null && (
                <span className="distance-label">{req.distance_km.toFixed(1)} km</span>
              )}
            </div>
            <p className="request-description">{req.description}</p>
            {req.address && <p className="request-address">📍 {req.address}</p>}
            {req.bid_deadline && (
              <p className="request-deadline">
                ⏱ Bidding closes: {new Date(req.bid_deadline).toLocaleTimeString("en-US")}
              </p>
            )}
            <button className="bid-btn" onClick={(e) => { e.stopPropagation(); setSelectedId(req.request_id); }}>
              View &amp; Bid →
            </button>
          </div>
        ))}
      </div>

      {(requests.length === REQUESTS_PAGE || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={requests.length < REQUESTS_PAGE || loading}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My bids
// ---------------------------------------------------------------------------

const BIDS_PAGE = 10;

function MyBidsSection({ token }) {
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  const load = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const data = await getMyBids(token, BIDS_PAGE, p * BIDS_PAGE);
      setBids(data);
      setPage(p);
    } catch (_) {}
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">📋 My Bids</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>

      {loading && bids.length === 0 && <div className="empty-state">⏳ Loading…</div>}
      {!loading && bids.length === 0 && <div className="empty-state">No bids submitted yet.</div>}

      <div className="bid-list">
        {bids.map((b) => (
          <div key={b.bid_id} className="bid-item">
            <div className="bid-item-header">
              <span className="bid-price">{formatUSD(b.price_cents)}</span>
              <span className={`bid-status bid-status-${b.status}`}>
                {BID_STATUS_LABELS[b.status] ?? b.status}
              </span>
            </div>
            <p className="bid-eta">⏱ ETA: {b.eta_min} min</p>
            {b.note && <p className="bid-note">💬 {b.note}</p>}
            <p className="bid-date">
              {new Date(b.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
            </p>
          </div>
        ))}
      </div>

      {(bids.length === BIDS_PAGE || page > 0) && (
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={bids.length < BIDS_PAGE || loading}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile section
// ---------------------------------------------------------------------------

function ProfileSection({ token, profile, onProfileUpdated }) {
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Show current skills as a read-only summary
  const currentSkills = (profile?.specialties ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError(null); setSuccess(false);
    try {
      const updated = await updateMyProfile(token, { bio: bio.trim() || null });
      onProfileUpdated(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="profile-card">
        <h3>👤 My Profile</h3>
        {currentSkills.length > 0 && (
          <div className="profile-skills-summary">
            <span className="profile-skills-label">Skills:</span>
            {currentSkills.map(k => (
              <span key={k} className="skill-badge">{CATEGORY_LABELS[k] ?? k}</span>
            ))}
          </div>
        )}
        <form className="profile-form" onSubmit={handleSave}>
          <label>Bio (optional)</label>
          <textarea
            placeholder="Short description of your experience…"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
          />
          {error && <p className="form-error">{error}</p>}
          <button className="profile-save-btn" type="submit" disabled={saving}>
            {saving ? "Saving…" : "✓ Save Bio"}
          </button>
          {success && <p className="profile-success">✓ Profile updated!</p>}
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills section — Sprint 50
// ---------------------------------------------------------------------------

function parseSkills(specialties) {
  return new Set((specialties ?? "").split(",").map(s => s.trim()).filter(Boolean));
}

function SkillsSection({ token, profile, onProfileUpdated }) {
  const [selected, setSelected] = useState(() => parseSkills(profile?.specialties));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Sync when the parent profile changes (e.g. after save)
  useEffect(() => {
    setSelected(parseSkills(profile?.specialties));
  }, [profile?.specialties]);

  function toggleSkill(key) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setError(null); setSuccess(false);
    try {
      const specialties = [...selected].join(",");
      const updated = await updateMyProfile(token, { specialties });
      onProfileUpdated(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="skills-section">
      <h3>🎯 My Skills</h3>
      <p className="skills-hint">
        Check every type of problem you can handle. These categories match exactly
        what customers select when they request help — so only matching professionals
        receive the request.
      </p>
      <form onSubmit={handleSave}>
        <div className="skills-grid">
          {ALL_SKILLS.map(({ key, label, desc }) => (
            <label key={key} className={`skill-item${selected.has(key) ? " selected" : ""}`}>
              <input
                type="checkbox"
                className="skill-checkbox"
                checked={selected.has(key)}
                onChange={() => toggleSkill(key)}
              />
              <span className="skill-label">{label}</span>
              <span className="skill-desc">{desc}</span>
            </label>
          ))}
        </div>
        {error && <p className="form-error">{error}</p>}
        {selected.size === 0 && (
          <p className="skills-warning">Select at least one skill before saving.</p>
        )}
        <button
          className="skills-save-btn"
          type="submit"
          disabled={saving || selected.size === 0}
        >
          {saving
            ? "Saving…"
            : `✓ Save Skills${selected.size > 0 ? ` (${selected.size} selected)` : ""}`}
        </button>
        {success && <p className="profile-success">✓ Skills updated!</p>}
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents section
// ---------------------------------------------------------------------------

function DocumentsSection({ token }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState("license");
  const [preview, setPreview] = useState(null);   // base64 data URL
  const [fileName, setFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

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
      <div className="section-header">
        <h2 className="section-title">📄 KYC Documents</h2>
      </div>

      <div className="doc-form">
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
        {error   && <p className="doc-err">{error}</p>}
        <button className="doc-submit-btn" type="submit" onClick={handleSubmit} disabled={submitting || !preview}>
          {submitting ? "Sending…" : "📤 Submit Document"}
        </button>
      </div>

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
// Notifications section
// ---------------------------------------------------------------------------

const NOTIF_PAGE = 15;
const NOTIF_ICONS = {
  document_approved: "✅",
  document_rejected: "❌",
  bid_accepted:      "🎉",
  bid_rejected:      "✗",
};

function NotificationsSection({ token, onRead }) {
  const [notifs, setNotifs] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (p = 0) => {
    setLoading(true);
    try {
      const data = await listNotifications(token, NOTIF_PAGE, p * NOTIF_PAGE);
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
        <h2 className="section-title">🔔 Notifications</h2>
        {unreadCount > 0 && (
          <button className="notif-mark-btn" onClick={handleMarkAll} disabled={marking}>
            {marking ? "…" : `Mark all read (${unreadCount})`}
          </button>
        )}
      </div>

      {loading && <p className="muted">⏳ Loading…</p>}
      {!loading && notifs.length === 0 && <p className="muted">No notifications yet.</p>}

      <div className="notif-list">
        {notifs.map((n) => (
          <div key={n.notification_id} className={`notif-item ${n.read ? "notif-read" : "notif-unread"}`}>
            <div className="notif-item-header">
              <span className="notif-icon">{NOTIF_ICONS[n.type] ?? "🔔"}</span>
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
        <div className="pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page === 0 || loading}>← Previous</button>
          <span className="page-info">Page {page + 1}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={notifs.length < NOTIF_PAGE || loading}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ user, token, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [tab, setTab] = useState("requests");
  const [unreadCount, setUnreadCount] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const refreshUnread = useCallback(() => {
    getUnreadCount(token).then((d) => setUnreadCount(d.count)).catch(() => {});
  }, [token]);

  useEffect(() => {
    Promise.all([
      getMyProfile(token).then((p) => { setProfile(p); setIsOnline(p.is_online); }).catch(() => {}),
    ]).finally(() => setInitialized(true));
    refreshUnread();
  }, [token]);

  useEffect(() => { refreshUnread(); }, [tab]);

  async function handleToggleOnline() {
    setTogglingOnline(true);
    try {
      const updated = await updateMyProfile(token, { is_online: !isOnline });
      setIsOnline(updated.is_online);
    } catch (_) {}
    finally { setTogglingOnline(false); }
  }

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
        <h1>Ziza Craft</h1>
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

      {/* Online / Offline toggle */}
      <button
        className={`online-toggle ${isOnline ? "online" : "offline"}`}
        onClick={handleToggleOnline}
        disabled={togglingOnline}
      >
        <span className="online-dot" />
        {togglingOnline ? "…" : isOnline ? "Available" : "Offline"}
      </button>

      {/* Tabs */}
      <div className="craft-tabs">
        <button
          className={`craft-tab ${tab === "requests" ? "active" : ""}`}
          onClick={() => setTab("requests")}
        >
          🛠️ Requests
        </button>
        <button
          className={`craft-tab ${tab === "bids" ? "active" : ""}`}
          onClick={() => setTab("bids")}
        >
          📋 My Bids
        </button>
        <button
          className={`craft-tab ${tab === "profile" ? "active" : ""}`}
          onClick={() => setTab("profile")}
        >
          👤 Profile
        </button>
        <button
          className={`craft-tab ${tab === "skills" ? "active" : ""}`}
          onClick={() => setTab("skills")}
        >
          🎯 Skills
        </button>
        <button
          className={`craft-tab ${tab === "documents" ? "active" : ""}`}
          onClick={() => setTab("documents")}
        >
          📄 Documents
        </button>
        <button
          className={`craft-tab ${tab === "notifications" ? "active" : ""}`}
          onClick={() => setTab("notifications")}
        >
          🔔{unreadCount > 0 && <span className="tab-badge-sm">{unreadCount}</span>}
        </button>
      </div>

      {tab === "requests"      && <OpenRequestsSection token={token} isOnline={isOnline} />}
      {tab === "bids"          && <MyBidsSection token={token} />}
      {tab === "profile"       && <ProfileSection token={token} profile={profile} onProfileUpdated={(p) => { setProfile(p); setIsOnline(p.is_online); }} />}
      {tab === "skills"        && <SkillsSection token={token} profile={profile} onProfileUpdated={(p) => { setProfile(p); }} />}
      {tab === "documents"     && <DocumentsSection token={token} />}
      {tab === "notifications" && <NotificationsSection token={token} onRead={refreshUnread} />}

      <p className="footer">App: <strong>web-craft</strong> · Sprint 53</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access denied
// ---------------------------------------------------------------------------

function AccessDenied({ role, onLogout }) {
  return (
    <div className="app">
      <h1>Ziza Craft</h1>
      <div className="status error">
        ✗ Access denied — expected role: {REQUIRED_ROLE} · you have: {role}
      </div>
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
    fetchMe(token)
      .then(setUser)
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); });
  }, [token]);

  // After login: upsert user row + professional profile
  useEffect(() => {
    if (!user || user.role !== REQUIRED_ROLE) return;
    registerUser(token)
      .then(() => registerProfessional(token))
      .catch(() => {});
  }, [user]);

  // Request web push permission and register device token
  useEffect(() => {
    if (!user || user.role !== REQUIRED_ROLE) return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "denied") return;
    Notification.requestPermission().then(async (permission) => {
      if (permission !== "granted") return;
      try {
        const deviceToken = `web-craft-${user.user_id}`;
        await registerDeviceToken(token, deviceToken, "web");
      } catch (_) {}
    }).catch(() => {});
  }, [user]);

  async function handleLogin(email, password) {
    setLoginLoading(true); setLoginError(null);
    try {
      const { access_token } = await login(email, password);
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginLoading(false); }
  }

  async function handleSignup(email, password, name, phone) {
    setLoginLoading(true); setLoginError(null);
    try {
      const { access_token } = await signup(email, password, name || null, phone || null);
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
    } catch (e) { setLoginError(e.message); }
    finally { setLoginLoading(false); }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  if (!token) return <LoginForm onLogin={handleLogin} onSignup={handleSignup} error={loginError} loading={loginLoading} />;
  if (!user)  return <div className="app"><div className="status loading">⏳ Loading…</div></div>;
  if (user.role !== REQUIRED_ROLE) return <AccessDenied role={user.role} onLogout={handleLogout} />;
  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}
