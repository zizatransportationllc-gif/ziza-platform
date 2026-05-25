import { useEffect, useState, useCallback } from "react";
import {
  login, fetchMe, registerUser,
  adminListDrivers, adminSetDriverCapabilities,
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

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({ onEmailLogin, onGoogleLogin, error, loading }) {
  const [email, setEmail] = useState("admin@ziza.dev");
  const [password, setPassword] = useState("ziza2024");
  return (
    <div className="app">
      <h1>Ziza Admin</h1>
      <p className="subtitle">Sprint 10 — Driver capability management</p>
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
// Capability editor — inline modal for a single driver
// ---------------------------------------------------------------------------

function CapabilityEditor({ token, driver, onSaved, onCancel }) {
  const [selected, setSelected] = useState(new Set(driver.capabilities));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function toggle(type) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      const caps = Array.from(selected);
      const result = await adminSetDriverCapabilities(token, driver.driver_id, caps);
      onSaved({ ...driver, capabilities: result.capabilities });
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="cap-editor">
      <div className="cap-editor-title">
        Modifier les compétences — <strong>{driver.email}</strong>
      </div>
      <div className="cap-hint">
        Vide = le chauffeur voit toutes les demandes d'assistance.
      </div>
      <div className="cap-grid">
        {ASSISTANCE_TYPES.map((type) => (
          <button
            key={type}
            className={`cap-btn ${selected.has(type) ? "selected" : ""}`}
            onClick={() => toggle(type)}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="cap-actions">
        <button className="cap-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? "Enregistrement…" : "✓ Enregistrer"}
        </button>
        <button className="cap-cancel-btn" onClick={onCancel} disabled={saving}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Driver row
// ---------------------------------------------------------------------------

function DriverRow({ driver, onEdit }) {
  const hasCaps = driver.capabilities.length > 0;
  return (
    <div className="driver-card">
      <div className="driver-card-header">
        <div>
          <span className="driver-email">{driver.email}</span>
          <span className={`driver-status-badge ${driver.status}`}>{driver.status}</span>
        </div>
        <button className="edit-caps-btn" onClick={() => onEdit(driver)}>
          Compétences
        </button>
      </div>
      <div className="driver-caps">
        {hasCaps ? (
          driver.capabilities.map((c) => (
            <span key={c} className="cap-chip">{TYPE_LABELS[c] ?? c}</span>
          ))
        ) : (
          <span className="cap-all">Toutes les demandes</span>
        )}
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
  const [editing, setEditing] = useState(null); // driver object being edited
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setDrivers(await adminListDrivers(token));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function handleSaved(updated) {
    setDrivers((prev) => prev.map((d) => d.driver_id === updated.driver_id ? updated : d));
    setEditing(null);
  }

  return (
    <div className="drivers-panel">
      <div className="panel-header">
        <h2 className="panel-title">Chauffeurs enregistrés</h2>
        <button className="refresh-btn" onClick={load} disabled={loading}>
          {loading ? "…" : "↻ Actualiser"}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {editing && (
        <CapabilityEditor
          token={token}
          driver={editing}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      {!loading && drivers.length === 0 && (
        <div className="empty-state">Aucun chauffeur enregistré.</div>
      )}

      <div className="driver-list">
        {drivers.map((d) => (
          <DriverRow key={d.driver_id} driver={d} onEdit={setEditing} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ user, token, onLogout }) {
  return (
    <div className="app admin-app">
      <header className="dash-header">
        <h1>Ziza Admin</h1>
        <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
      </header>
      <div className="status ok">✓ Connecté — <strong>{user.email}</strong></div>
      <div className="role-badge">{user.role} · {user.provider}</div>

      <DriversPanel token={token} />

      <p className="footer">App: <strong>web-admin</strong> · Sprint 10</p>
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
