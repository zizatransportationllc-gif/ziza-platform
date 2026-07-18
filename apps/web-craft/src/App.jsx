import { useEffect, useState, useCallback, useRef } from "react";
import {
  login, signup, exchangeFirebaseToken, fetchMe, registerUser, registerProfessional,
  getMyProfile, updateMyProfile, getProfile, updateProfile,
  avatarUploadUrl, getBankAccount, setBankAccount,
  listOpenRequests, getCraftRequest,
  submitBid, getMyBids, craftMarkArrived, craftWorkDone, uploadCraftPhoto, listCraftPhotos, reverseGeocode,
  getProBalance, listProPayouts,
  getConnectStatus, connectOnboard,
  getIssuingCard, issueIssuingCard, setIssuingCardStatus,
  listRequestMessages, sendRequestMessage,
  submitDocument, listMyDocuments,
  listNotifications, getUnreadCount, markAllRead, deleteNotification,
  registerDeviceToken,
  formatUSD,
} from "./api";
import { firebaseEnabled, signInWithGoogle, signUpEmail, signInEmail, sendPasswordReset, resendVerification, changeEmail, firebaseSignOut } from "./auth";
import Icon from "./Icon";
import NavigationView from "./NavigationView";

const REQUIRED_ROLE = "professional";
const TOKEN_KEY = "ziza_craft_token";
const POLL_MS = 6000;

const CATEGORY_LABELS = {
  breakdown:   "Breakdown",
  flat_tyre:   "Flat Tire",
  tow:         "Tow Truck",
  fuel:        "Out of Fuel",
  lockout:     "Lockout",
  battery:     "Battery",
  accident:    "Accident",
  diagnostics: "Diagnostics",
  other:       "Other",
};
// Category → Icon name (see Icon.jsx). Labels are text-only so the same map
// renders cleanly in chips, badges and the skills picker.
const CATEGORY_ICON = {
  breakdown: "requests", flat_tyre: "tire", tow: "tow", fuel: "fuel",
  lockout: "lock", battery: "battery", accident: "alert",
  diagnostics: "search", other: "requests",
};

// Skills available to professionals — identical to customer problem categories
// so a customer's request always finds a professional with the right skill.
const ALL_SKILLS = [
  { key: "breakdown",   label: "Breakdown",    desc: "Car won't start / general breakdown" },
  { key: "flat_tyre",   label: "Flat Tire",     desc: "Punctured or flat tire replacement" },
  { key: "tow",         label: "Tow Truck",     desc: "Towing to a garage or safe location" },
  { key: "fuel",        label: "Out of Fuel",   desc: "Emergency fuel delivery" },
  { key: "lockout",     label: "Lockout",       desc: "Keys locked inside the vehicle" },
  { key: "battery",     label: "Battery",       desc: "Jump-start or battery replacement" },
  { key: "accident",    label: "Accident",      desc: "Post-accident assistance & scene management" },
  { key: "diagnostics", label: "Diagnostics",   desc: "Electronic / OBD on-site diagnostics" },
  { key: "other",       label: "Other",        desc: "Any other vehicle intervention" },
];

const BID_STATUS_LABELS = {
  pending:  "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
};

const DOCUMENT_TYPES = ["license", "insurance", "registration", "id_card"];
const DOCUMENT_TYPE_LABELS = {
  license:      "🪪 Driver's License",
  insurance:    "🛡️ Vehicle Insurance",
  registration: "📋 Vehicle Registration",
  id_card:      "🪪 Government ID",
};
const DOCUMENT_STATUS_LABELS = {
  pending:            "Pending",
  approved:           "Approved",
  rejected:           "Rejected",
  needs_resubmission: "Resubmit Required",
};

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
  const [email, setEmail] = useState("professional@ziza.dev");
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
      <img src="/logo-craft.svg" alt="Ziza Craft" className="app-logo" />
      <div className="auth-tabs">
        <button className={`auth-tab${tab === "signin" ? " active" : ""}`} onClick={() => setTab("signin")}>Sign In</button>
        <button className={`auth-tab${tab === "signup" ? " active" : ""}`} onClick={() => setTab("signup")}>Join as Pro</button>
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
          <p className="hint">Dev: professional@ziza.dev / ziza2024</p>
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
            <input type="tel" value={suPhone} onChange={(e) => setSuPhone(e.target.value)} placeholder="Phone number" />
            <button type="submit" disabled={loading}>{loading ? "Creating account…" : "Join as Professional"}</button>
          </form>
          {notice && <p className="verify-notice">{notice}</p>}
          {(suError || error) && <p className="form-error">{suError || error}</p>}
          <p className="hint">After sign-up, complete your professional profile to receive service requests.</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat panel for a craft request — Sprint 66 (polling 3s)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Before/after photos for a craft job
// ---------------------------------------------------------------------------

function CraftPhotos({ token, requestId, canUpload }) {
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    listCraftPhotos(token, requestId).then(setPhotos).catch(() => {});
  }, [token, requestId]);
  useEffect(() => { load(); }, [load]);

  async function handleFile(kind, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(kind); setErr(null);
    try { await uploadCraftPhoto(token, requestId, kind, file); await load(); }
    catch (x) { setErr(x.message); }
    finally { setBusy(null); e.target.value = ""; }
  }

  return (
    <div className="craft-photos">
      <h3 className="craft-photos-title">📷 Before / After photos</h3>
      {err && <p className="form-error">{err}</p>}
      {["before", "after"].map((k) => {
        const items = photos.filter((p) => p.kind === k);
        return (
          <div key={k} className="craft-photo-group">
            <div className="craft-photo-head">
              <span>{k === "before" ? "Before" : "After"}</span>
              {canUpload && (
                <label className="craft-photo-add">
                  {busy === k ? "Uploading…" : "+ Add photo"}
                  <input type="file" accept="image/*" capture="environment" hidden
                    onChange={(e) => handleFile(k, e)} disabled={busy !== null} />
                </label>
              )}
            </div>
            <div className="craft-photo-thumbs">
              {items.map((p) => p.url && (
                <a key={p.photo_id} href={p.url} target="_blank" rel="noopener noreferrer">
                  <img src={p.url} alt={k} className="craft-photo-thumb" />
                </a>
              ))}
              {items.length === 0 && <span className="craft-photo-empty">No photos yet</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Request detail + bid form
// ---------------------------------------------------------------------------

function RequestDetail({ token, requestId, onBack, canManage = false }) {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Bid form state
  const [priceDollars, setPriceDollars] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bidSuccess, setBidSuccess] = useState(false);
  const [bidError, setBidError] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [proPos, setProPos] = useState(null);
  const [proAddr, setProAddr] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    getCraftRequest(token, requestId)
      .then(setRequest)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, requestId]);

  useEffect(() => { reload(); }, [reload]);

  // Poll the request status so the pro sees customer-side transitions (e.g. the
  // customer confirming arrival → in_progress) without a manual refresh. Silent
  // update (no spinner); stops at terminal states.
  useEffect(() => {
    const status = request?.status;
    if (!status || ["completed", "cancelled"].includes(status)) return;
    const iv = setInterval(() => {
      getCraftRequest(token, requestId).then(setRequest).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(iv);
  }, [token, requestId, request?.status]);

  // Auto-capture the pro's GPS + address when the request is open (for the bid).
  useEffect(() => {
    if (request?.status !== "open") return;
    let active = true;
    getPosition().then(async (p) => {
      if (!active || !p) return;
      setProPos(p);
      const r = await reverseGeocode(token, p.lat, p.lng);
      if (active && r?.name) setProAddr(r.name);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.status]);

  function getPosition() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }

  async function handleBid(e) {
    e.preventDefault();
    if (!priceDollars) return;
    setSubmitting(true); setBidError(null); setBidSuccess(false);
    try {
      const pos = proPos || await getPosition();
      await submitBid(token, requestId, Math.round(parseFloat(priceDollars) * 100), note.trim() || null, pos);
      setBidSuccess(true);
      setPriceDollars(""); setNote("");
    } catch (err) { setBidError(err.message); }
    finally { setSubmitting(false); }
  }

  async function runAction(fn) {
    setActionBusy(true); setError(null);
    try { setRequest(await fn(token, requestId)); }
    catch (err) { setError(err.message); }
    finally { setActionBusy(false); }
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
            <span>🛣️ {fmtMiles(request.distance_km)} mi away</span>
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

      {/* Shared verification code once a bid is selected (winning pro only) */}
      {canManage && request.verification_code && (
        <div className="craft-code-card">
          <span className="craft-code-label">🔐 Verification code</span>
          <span className="craft-code-value">{request.verification_code}</span>
          <span className="craft-code-hint">Confirm this with the customer on site.</span>
        </div>
      )}

      {/* Before/after photos (winning pro only) */}
      {canManage && (
        <CraftPhotos
          token={token}
          requestId={requestId}
          canUpload={["assigned", "arrived", "in_progress"].includes(request.status)}
        />
      )}

      {/* In-app navigation window — follows the pro to the customer */}
      {canManage && ["assigned", "arrived", "in_progress"].includes(request.status) && (
        <>
          <NavigationView target={{ lat: request.lat, lng: request.lng }} label="Customer" />
          {/* Optional external navigation — opens a maps app; the in-app window stays here. */}
          <a
            className="craft-nav-btn craft-nav-btn-secondary"
            href={`https://www.google.com/maps/dir/?api=1&destination=${request.lat},${request.lng}&travelmode=driving`}
            target="_blank"
            rel="noopener noreferrer"
          >
            🧭 Open in external maps
          </a>
        </>
      )}

      {canManage && ["assigned", "arrived", "in_progress", "pro_done"].includes(request.status) && (
        <RequestChatPanel token={token} requestId={requestId} accent="#4c82f0" />
      )}

      {/* Pro lifecycle actions (winning pro only) */}
      {canManage && request.status === "assigned" && (
        <button className="bid-submit-btn" disabled={actionBusy} onClick={() => runAction(craftMarkArrived)}>
          {actionBusy ? "…" : "📍 I've arrived at the customer"}
        </button>
      )}
      {canManage && request.status === "arrived" && (
        <div className="craft-wait">⏳ Waiting for the customer to confirm your arrival…</div>
      )}
      {canManage && request.status === "in_progress" && (
        <button className="bid-submit-btn" disabled={actionBusy} onClick={() => runAction(craftWorkDone)}>
          {actionBusy ? "…" : "🔧 Mark work as done"}
        </button>
      )}
      {canManage && request.status === "pro_done" && (
        <div className="craft-wait">⏳ Waiting for the customer to confirm completion…</div>
      )}
      {canManage && request.status === "completed" && (
        <p className="bid-success">🎉 Job completed.</p>
      )}

      {/* Bid form — only while the request is still open */}
      {request.status === "open" && (bidSuccess ? (
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
            <p className="bid-eta-hint">⏱ ETA is calculated automatically from your GPS position.</p>
            {proAddr && <p className="bid-eta-hint">📡 Your position: {proAddr}</p>}
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
      ))}
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
        canManage={false}
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
                <span className="distance-label">{fmtMiles(req.distance_km)} mi</span>
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
  const [selectedId, setSelectedId] = useState(null);

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

  if (selectedId) {
    return (
      <RequestDetail
        token={token}
        requestId={selectedId}
        onBack={() => { setSelectedId(null); load(page); }}
        canManage={true}
      />
    );
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">📋 My Bids</h2>
        <button className="refresh-btn" onClick={() => load(page)} disabled={loading}>↻</button>
      </div>

      {loading && bids.length === 0 && <div className="empty-state">⏳ Loading…</div>}
      {!loading && bids.length === 0 && <div className="empty-state">No bids submitted yet.</div>}

      <div className="bid-list">
        {bids.map((b) => {
          const accepted = b.status === "accepted";
          return (
            <div
              key={b.bid_id}
              className={`bid-item${accepted ? " bid-item-accepted" : ""}`}
              onClick={accepted ? () => setSelectedId(b.request_id) : undefined}
              role={accepted ? "button" : undefined}
              tabIndex={accepted ? 0 : undefined}
            >
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
              {accepted && (
                <button className="bid-open-btn" onClick={(e) => { e.stopPropagation(); setSelectedId(b.request_id); }}>
                  🧭 Open job &amp; navigate to customer →
                </button>
              )}
            </div>
          );
        })}
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
// Withdrawals section — Sprint 67 (balance-capped)
// ---------------------------------------------------------------------------

const PRO_PAYOUT_STATUS_LABELS = {
  pending:  "Pending",
  approved: "Approved",
  rejected: "Rejected",
  processed: "Paid",
  failed:   "Failed",
};

// Sprint 70 — Ziza debit card (Stripe Issuing): spend the Connect balance.
function ZizaCard({ token, issuingReady }) {
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getIssuingCard(token).then(setCard).catch(() => {}).finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function handleIssue() {
    setBusy(true); setError(null);
    try { setCard(await issueIssuingCard(token)); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function handleToggle() {
    if (!card) return;
    setBusy(true); setError(null);
    try { setCard(await setIssuingCardStatus(token, card.status !== "active")); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (loading) return null;
  return (
    <div style={{ background: "#111827", color: "#fff", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, opacity: 0.8 }}>💳 Ziza debit card</div>
      {card ? (
        <>
          <div style={{ fontSize: 22, letterSpacing: 2, margin: "8px 0" }}>•••• •••• •••• {card.last4 || "••••"}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, textTransform: "uppercase", opacity: 0.8 }}>
              {card.status === "active" ? "🟢 Active" : "⏸️ Frozen"}
            </span>
            <button type="button" className="payout-submit-btn" onClick={handleToggle} disabled={busy}>
              {card.status === "active" ? "Freeze" : "Unfreeze"}
            </button>
          </div>
        </>
      ) : issuingReady ? (
        <>
          <p style={{ fontSize: 13, opacity: 0.85, margin: "8px 0" }}>Get a card to spend your earnings instantly.</p>
          <button type="button" className="payout-submit-btn" onClick={handleIssue} disabled={busy}>
            {busy ? "Issuing…" : "Get my card"}
          </button>
        </>
      ) : (
        <p style={{ fontSize: 13, opacity: 0.85, margin: "8px 0" }}>
          Your Ziza card will be available once your account is fully verified.
        </p>
      )}
      {error && <p className="payout-err" style={{ color: "#fca5a5" }}>{error}</p>}
    </div>
  );
}

function WithdrawalsSection({ token }) {
  const [cardBalance, setCardBalance] = useState(null); // connect_available_cents
  const [cardPending, setCardPending] = useState(0);    // connect_pending_cents
  const [payouts, setPayouts] = useState([]);
  const [connect, setConnect] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getProBalance(token).then((b) => { setCardBalance(b.connect_available_cents ?? null); setCardPending(b.connect_pending_cents ?? 0); }).catch(() => {}),
      listProPayouts(token).then(setPayouts).catch(() => {}),
      getConnectStatus(token).then(setConnect).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const payoutsReady = connect && connect.payouts_enabled;

  async function handleOnboard() {
    try {
      const r = await connectOnboard(token);
      if (r.onboarding_url) window.open(r.onboarding_url, "_blank", "noopener");
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">💳 Payouts & Card</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>↻</button>
      </div>

      <ZizaCard token={token} issuingReady={connect?.card_issuing_active} />

      {connect && !payoutsReady && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <p style={{ margin: "0 0 8px" }}>⚠️ To get paid, set up your payout account.</p>
          <button type="button" className="payout-submit-btn" onClick={handleOnboard}>Set up payouts →</button>
        </div>
      )}

      {cardBalance != null && (
        <p className="payout-available">
          Available on your card: <strong>{formatUSD(cardBalance)}</strong>
        </p>
      )}
      {cardPending > 0 && (
        <p className="payout-available" style={{ fontSize: 13, color: "#6b7280" }}>
          ⏳ On the way: <strong>{formatUSD(cardPending)}</strong> — clearing in your Ziza balance
        </p>
      )}

      <p className="payout-available" style={{ fontSize: 13, color: "#6b7280" }}>
        Your bid is paid automatically to your Ziza balance and spendable with your
        debit card — no manual withdrawal needed.
      </p>
      {error && <p className="payout-err">{error}</p>}

      {payouts.length > 0 && <h3 className="section-title" style={{ fontSize: 14 }}>Past withdrawals</h3>}
      <div className="bid-list">
        {payouts.map((p) => (
          <div key={p.payout_id} className="bid-item">
            <div className="bid-item-header">
              <span className="bid-price">{formatUSD(p.amount_cents)}</span>
              <span className={`bid-status bid-status-${p.status}`}>
                {PRO_PAYOUT_STATUS_LABELS[p.status] ?? p.status}
              </span>
            </div>
            {p.note_admin && <p className="bid-note">💬 {p.note_admin}</p>}
            <p className="bid-date">
              {new Date(p.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile section
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
    <div className="profile-card" style={{ marginTop: 16 }}>
      <h3>🏦 Payout bank account</h3>
      {bank && (
        <p style={{ fontSize: 13, opacity: 0.85, marginTop: -6 }}>
          On file: {bank.account_holder_name} · ****{bank.account_number_last4} ({bank.account_type})
        </p>
      )}
      <form className="profile-form" onSubmit={save}>
        <label>Account holder name</label>
        <input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={128} required />
        <label>Routing number</label>
        <input value={routing} onChange={(e) => setRouting(e.target.value)} maxLength={34} required placeholder="021000021" />
        <label>Account number</label>
        <input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={64} required placeholder={bank ? "Enter to replace" : "Account number"} />
        <label>Account type</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
        </select>
        {err && <p className="form-error">{err}</p>}
        {msg && <p className="profile-success">{msg}</p>}
        <button className="profile-save-btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Save bank account"}</button>
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
    <div style={{ margin: "6px 0 14px" }}>
      {!open ? (
        <button type="button" className="link-btn" style={{ width: "auto" }} onClick={() => { setOpen(true); setMsg(null); setErr(null); }}>
          ✉️ Change email
        </button>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input
            type="email" placeholder="New email address" value={newEmail} required
            onChange={(e) => setNewEmail(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-fg)" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={busy} style={{ background: "var(--color-accent-strong)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 600 }}>
              {busy ? "…" : "Send confirmation"}
            </button>
            <button type="button" onClick={() => setOpen(false)} disabled={busy} style={{ background: "transparent", border: "1px solid var(--color-border)", borderRadius: 8, padding: "8px 12px", cursor: "pointer", color: "var(--color-fg)" }}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {msg && <p className="verify-notice">{msg}</p>}
      {err && <p className="form-error">{err}</p>}
    </div>
  );
}

function ProfileSection({ token, profile, onProfileUpdated }) {
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  // Sprint 66 — personal identity (separate from the professional profile)
  const [me, setMe] = useState(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [savingMe, setSavingMe] = useState(false);
  const [successMe, setSuccessMe] = useState(false);
  const [errorMe, setErrorMe] = useState(null);

  useEffect(() => {
    getProfile(token)
      .then((p) => {
        setMe(p);
        setFirstName(p.first_name || "");
        setLastName(p.last_name || "");
        setBirthDate(p.date_of_birth || "");
        setPhone(p.phone || "");
      })
      .catch((e) => setErrorMe(e.message));
  }, [token]);

  async function handleAvatar(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setAvatarBusy(true); setErrorMe(null);
    try {
      const ct = file.type || "image/jpeg";
      const { upload_url, final_url } = await avatarUploadUrl(token, file.name, ct);
      await fetch(upload_url, { method: "PUT", headers: { "Content-Type": ct }, body: file });
      const updated = await updateProfile(token, { avatar_url: final_url });
      setMe(updated);
    } catch (err) { setErrorMe("Photo upload failed: " + err.message); }
    finally { setAvatarBusy(false); }
  }

  async function handleSavePersonal(e) {
    e.preventDefault();
    setSavingMe(true); setErrorMe(null); setSuccessMe(false);
    try {
      const updated = await updateProfile(token, {
        first_name: firstName || null,
        last_name: lastName || null,
        date_of_birth: birthDate || null,
        phone: phone || null,
      });
      setMe(updated);
      setSuccessMe(true);
      setTimeout(() => setSuccessMe(false), 3000);
    } catch (err) { setErrorMe(err.message); }
    finally { setSavingMe(false); }
  }

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
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#e5e7eb", overflow: "hidden", flexShrink: 0 }}>
            {me && me.avatar_url
              ? <img src={me.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 26 }}>👤</div>}
          </div>
          <label style={{ fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#4c82f0" }}>
            {avatarBusy ? "Uploading…" : "📷 Change photo"}
            <input type="file" accept="image/*" onChange={handleAvatar} disabled={avatarBusy} style={{ display: "none" }} />
          </label>
        </div>
        {me && <p style={{ fontSize: 13, opacity: 0.8, marginTop: -6 }}>✉️ {me.email} · {me.role}</p>}
        <ChangeEmailBox />
        <form className="profile-form" onSubmit={handleSavePersonal}>
          <label>First name</label>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={64} placeholder="First name" />
          <label>Last name</label>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={64} placeholder="Last name" />
          <label>Date of birth</label>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          <label>Phone</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} placeholder="Phone number" />
          {errorMe && <p className="form-error">{errorMe}</p>}
          <button className="profile-save-btn" type="submit" disabled={savingMe}>
            {savingMe ? "Saving…" : "✓ Save Personal Info"}
          </button>
          {successMe && <p className="profile-success">✓ Profile updated!</p>}
        </form>
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
      <BankAccountForm token={token} />
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
              <span className="skill-label"><Icon name={CATEGORY_ICON[key] ?? "requests"} size={15} /> {label}</span>
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
// Documents section — Sprint 58
// ---------------------------------------------------------------------------

const ONBOARDING_STEPS_CRAFT = [
  "Account Created",
  "Documents Submitted",
  "Under Review",
  "Account Approved",
];

function OnboardingProgressCraft({ docs, entityStatus }) {
  const hasAnyDoc     = docs.length > 0;
  const hasActionItem = docs.some((d) => d.status === "rejected" || d.status === "needs_resubmission");
  let currentStep = 1;
  if (hasAnyDoc)                   currentStep = 2;
  if (hasAnyDoc && !hasActionItem) currentStep = 3;
  if (entityStatus === "active")   currentStep = 4;

  return (
    <div className="onboarding-stepper">
      {ONBOARDING_STEPS_CRAFT.map((label, i) => {
        const n    = i + 1;
        const done = n < currentStep;
        const cur  = n === currentStep;
        return (
          <div key={n} className="stepper-step">
            <div className={`stepper-circle ${done ? "circle-done" : cur ? "circle-active" : "circle-todo"}`}>
              {done ? "✓" : n}
            </div>
            <span className={`stepper-label ${done || cur ? "label-active" : "label-todo"}`}>{label}</span>
            {i < ONBOARDING_STEPS_CRAFT.length - 1 && (
              <div className={`stepper-line ${done ? "line-done" : "line-todo"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DocumentsSection({ token, profStatus = "pending_docs" }) {
  const [docs, setDocs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [docType, setDocType]       = useState("license");
  const [preview, setPreview]       = useState(null);   // base64 data URL (upload form)
  const [fileName, setFileName]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]       = useState(null);
  const [error, setError]           = useState(null);
  const [docPreviewModal, setDocPreviewModal] = useState(null); // { url, isPdf, label }

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
    <>
    {/* ── Document preview modal ─────────────────────────────────────────── */}
    {docPreviewModal && (
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        onClick={() => setDocPreviewModal(null)}
      >
        <div
          style={{ background: "#fff", borderRadius: 12, overflow: "hidden", width: "min(92vw, 920px)", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: "1px solid #E5E7EB", background: "#F9FAFB" }}>
            <div>
              <strong style={{ fontSize: 14, color: "#111827" }}>{docPreviewModal.label}</strong>
              <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 10 }}>{docPreviewModal.isPdf ? "PDF" : "Image"}</span>
            </div>
            <button
              onClick={() => setDocPreviewModal(null)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#6B7280", lineHeight: 1, padding: "2px 6px" }}
              title="Close"
            >✕</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", background: "#1F2937", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 360 }}>
            {docPreviewModal.isPdf ? (
              <iframe
                src={docPreviewModal.url}
                style={{ width: "100%", height: "72vh", border: "none" }}
                title={docPreviewModal.label}
              />
            ) : (
              <img
                src={docPreviewModal.url}
                alt={docPreviewModal.label}
                style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain", display: "block" }}
              />
            )}
          </div>
        </div>
      </div>
    )}

    <div className="documents-section">
      <div className="section-header">
        <h2 className="section-title">📄 KYC Documents</h2>
      </div>

      {!loading && <OnboardingProgressCraft docs={docs} entityStatus={profStatus} />}

      {actionDocs.length > 0 && (
        <div className="doc-action-banner">
          <strong>⚠️ Action Required</strong>
          <p>{actionDocs.length} document{actionDocs.length > 1 ? "s" : ""} need{actionDocs.length === 1 ? "s" : ""} your attention — please re-upload below.</p>
        </div>
      )}

      {!loading && docs.length > 0 && actionDocs.length === 0 && profStatus !== "active" && (
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
        <button className="doc-submit-btn" type="submit" disabled={submitting || !preview}>
          {submitting ? "Sending…" : "📤 Submit Document"}
        </button>
      </form>

      <div className="doc-list">
        {loading && <p className="loading-msg">Loading…</p>}
        {!loading && docs.length === 0 && (
          <p className="doc-empty">No documents submitted yet.</p>
        )}
        {docs.map((d) => {
          const isPdf = d.url?.startsWith("data:application/pdf") || d.url?.toLowerCase().endsWith(".pdf");
          return (
            <div key={d.document_id} className={`doc-item doc-${d.status}`}>
              <div className="doc-item-main">
                <span className="doc-type">{DOCUMENT_TYPE_LABELS[d.type] ?? d.type}</span>
                <span className={`doc-status doc-status-${d.status}`}>
                  {DOCUMENT_STATUS_LABELS[d.status] ?? d.status}
                </span>
                {/* Preview button */}
                {d.url && (
                  <button
                    className="doc-preview-btn"
                    type="button"
                    onClick={() => setDocPreviewModal({ url: d.url, isPdf, label: DOCUMENT_TYPE_LABELS[d.type] ?? d.type })}
                  >
                    👁 Preview
                  </button>
                )}
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
          );
        })}
      </div>
    </div>
    </>
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

// ---------------------------------------------------------------------------
// Account section — Sprint 65: secondary items grouped under one tab
// ---------------------------------------------------------------------------

function CraftAccountSection({ token, profile, onProfileUpdated, profStatus, sub, onSub }) {
  const needsDocs = profStatus === "pending_docs";
  const ITEMS = [
    { key: "profile",   icon: "👤", label: "Profile" },
    { key: "skills",    icon: "🎯", label: "Skills" },
    { key: "documents", icon: "📄", label: "Documents", badge: needsDocs },
  ];

  if (sub) {
    return (
      <div className="account-sub">
        <button className="account-back-btn" onClick={() => onSub(null)}>← Account</button>
        {sub === "profile"   && <ProfileSection token={token} profile={profile} onProfileUpdated={onProfileUpdated} />}
        {sub === "skills"    && <SkillsSection token={token} profile={profile} onProfileUpdated={onProfileUpdated} />}
        {sub === "documents" && <DocumentsSection token={token} profStatus={profStatus} />}
      </div>
    );
  }

  return (
    <div className="account-section">
      <h2 className="section-title">👤 Account</h2>
      <div className="account-menu">
        {ITEMS.map((it) => (
          <button key={it.key} className="account-menu-row" onClick={() => onSub(it.key)}>
            <span className="account-menu-icon">{it.icon}</span>
            <span className="account-menu-label">{it.label}</span>
            {it.badge && <span className="account-menu-badge" title="Action required">!</span>}
            <span className="account-menu-chevron">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Dashboard({ user, token, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [profStatus, setProfStatus] = useState("pending_docs"); // Sprint 54 — safe default: lock until profile confirmed
  const [isOnline, setIsOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [tab, setTab] = useState("requests"); // "requests" | "earnings" | "bids" | "account" | "notifications"
  const [accountSub, setAccountSub] = useState(null); // sub-screen within Account
  const [unreadCount, setUnreadCount] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const refreshUnread = useCallback(() => {
    getUnreadCount(token).then((d) => setUnreadCount(d.count)).catch(() => {});
  }, [token]);

  // Jump to Account → Documents (used by the KYC pending banner).
  const goToDocs = useCallback(() => { setAccountSub("documents"); setTab("account"); }, []);

  useEffect(() => {
    Promise.all([
      getMyProfile(token).then((p) => { setProfile(p); setIsOnline(p.is_online); setProfStatus(p.status || "pending_docs"); }).catch(() => {}),
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
            <Icon name="bell" size={20} />{unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
          </button>
          <button className="logout-btn" onClick={onLogout}>Sign Out</button>
        </div>
      </header>

      <div className="status ok">✓ Signed in — <strong>{user.email}</strong></div>
      <div className="role-badge">{user.role} · {user.provider}</div>

      {/* Online / Offline toggle — locked while pending_docs */}
      <button
        className={`online-toggle ${profStatus === "pending_docs" ? "online-locked" : isOnline ? "online" : "offline"}`}
        onClick={handleToggleOnline}
        disabled={togglingOnline || profStatus === "pending_docs"}
        title={profStatus === "pending_docs" ? "Account pending verification — submit your documents to unlock" : undefined}
      >
        <span className="online-dot" />
        {togglingOnline ? "…" : profStatus === "pending_docs" ? "🔒 Locked" : isOnline ? "Available" : "Offline"}
      </button>

      {/* Tabs */}
      <div className="craft-tabs">
        <button
          className={`craft-tab ${tab === "requests" ? "active" : ""}`}
          onClick={() => setTab("requests")}
        >
          <Icon name="requests" /> Requests
        </button>
        <button
          className={`craft-tab ${tab === "earnings" ? "active" : ""}`}
          onClick={() => setTab("earnings")}
        >
          <Icon name="earnings" /> Earnings
        </button>
        <button
          className={`craft-tab ${tab === "bids" ? "active" : ""}`}
          onClick={() => setTab("bids")}
        >
          <Icon name="bids" /> My Bids
        </button>
        <button
          className={`craft-tab ${tab === "account" ? "active" : ""}`}
          onClick={() => { setAccountSub(null); setTab("account"); }}
        >
          <Icon name="account" /> Account
        </button>
      </div>

      {/* Sprint 54 — KYC pending gate */}
      {profStatus === "pending_docs" && (
        <div className="kyc-pending-banner">
          <div className="kyc-pending-icon">🔒</div>
          <div>
            <strong>Account pending verification</strong>
            <p>Submit your professional documents below. Access to client requests will be unlocked once an admin approves your documents.</p>
          </div>
          {accountSub !== "documents" && (
            <button className="btn-kyc-docs" onClick={goToDocs}>📄 Submit Documents →</button>
          )}
        </div>
      )}

      {tab === "requests"      && (
        profStatus === "pending_docs" ? (
          <div className="offline-notice">
            <div className="offline-icon">📋</div>
            <p>Document verification required.</p>
            <p className="offline-sub">Please submit your professional documents to unlock client requests.</p>
          </div>
        ) : (
          <OpenRequestsSection token={token} isOnline={isOnline} />
        )
      )}
      {tab === "earnings"      && <WithdrawalsSection token={token} />}
      {tab === "bids"          && <MyBidsSection token={token} />}
      {tab === "account"       && (
        <CraftAccountSection
          token={token}
          profile={profile}
          onProfileUpdated={(p) => { setProfile(p); setIsOnline(p.is_online); }}
          profStatus={profStatus}
          sub={accountSub}
          onSub={setAccountSub}
        />
      )}
      {tab === "notifications" && <NotificationsSection token={token} onRead={refreshUnread} />}

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

// Stripe redirects here after hosted Connect onboarding: /payouts/return when
// the payee finishes, /payouts/refresh when the account link expired.
function PayoutReturnView({ token, mode }) {
  const [connect, setConnect] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (mode === "refresh") {
      // The one-time onboarding link expired — mint a fresh one and resume.
      connectOnboard(token)
        .then((r) => { if (r.onboarding_url) window.location.href = r.onboarding_url; })
        .catch((e) => { setErr(e.message); setLoading(false); });
      return;
    }
    getConnectStatus(token)
      .then(setConnect)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [token, mode]);

  const goHome = () => window.location.assign("/");

  if (mode === "refresh") {
    return (
      <div className="app"><div className="status loading">
        {err ? `⚠️ ${err}` : "⏳ Refreshing your onboarding link…"}
      </div></div>
    );
  }

  const ready = connect?.payouts_enabled;
  return (
    <div className="app" style={{ maxWidth: 480, margin: "0 auto", padding: 24, textAlign: "center" }}>
      {loading ? (
        <div className="status loading">⏳ Checking your payout account…</div>
      ) : ready ? (
        <>
          <div style={{ fontSize: 48 }}>✅</div>
          <h2>You're all set!</h2>
          <p>Your payout account is verified. Your bids are paid automatically to your
            Ziza balance — no manual withdrawal needed.</p>
        </>
      ) : (
        <>
          <div style={{ fontSize: 48 }}>⏳</div>
          <h2>Almost there</h2>
          <p>Thanks! Stripe is still verifying your details — this can take a few
            minutes. We'll enable payouts as soon as it's done.</p>
        </>
      )}
      {err && <p className="payout-err">{err}</p>}
      <button type="button" className="payout-submit-btn" onClick={goHome} style={{ marginTop: 16 }}>
        Back to Ziza →
      </button>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [loginNotice, setLoginNotice] = useState(null);
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

  // When the backend refuses an unverified e-mail (prod gate), surface a
  // friendly "verify your e-mail" notice instead of a raw error. (Sprint 67)
  async function handleUnverified(email, { resend }) {
    if (resend) { try { await resendVerification(); } catch (_) { /* best effort */ } }
    await firebaseSignOut();
    setLoginError(null);
    setLoginNotice(`Please verify your email. We sent a link to ${email} — click it, then sign in.`);
  }

  async function handleLogin(email, password) {
    setLoginLoading(true); setLoginError(null); setLoginNotice(null);
    try {
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
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  if (!token) return <LoginForm onEmailLogin={handleLogin} onGoogleLogin={handleGoogleLogin} onSignup={handleSignup} error={loginError} notice={loginNotice} loading={loginLoading} />;
  // Stripe Connect onboarding redirect targets (see settings.connect_app_base_pro).
  const path = window.location.pathname;
  if (path === "/payouts/return" || path === "/payouts/refresh") {
    return <PayoutReturnView token={token} mode={path.endsWith("refresh") ? "refresh" : "return"} />;
  }
  if (!user)  return <div className="app"><div className="status loading">⏳ Loading…</div></div>;
  if (user.role !== REQUIRED_ROLE) return <AccessDenied role={user.role} onLogout={handleLogout} />;
  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}
