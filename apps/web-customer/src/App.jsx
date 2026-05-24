import { useEffect, useState } from "react";
import { login, fetchMe, fetchDemo } from "./api";

const REQUIRED_ROLE = "customer";
const TOKEN_KEY = "ziza_token";

function LoginForm({ onSuccess, error, loading }) {
  const [email, setEmail] = useState("customer@ziza.dev");
  const [password, setPassword] = useState("ziza2024");

  return (
    <div className="app">
      <h1>Ziza Customer</h1>
      <p className="subtitle">Sprint 2 — Auth DEV</p>
      <form
        className="login-form"
        onSubmit={(e) => { e.preventDefault(); onSuccess(email, password); }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Connexion…" : "Se connecter"}
        </button>
        {error && <p className="form-error">{error}</p>}
      </form>
      <p className="hint">Dev users: customer@ziza.dev / driver@ziza.dev / admin@ziza.dev<br />Password: ziza2024</p>
    </div>
  );
}

function Dashboard({ user, demo, onLogout }) {
  return (
    <div className="app">
      <header className="dash-header">
        <h1>Ziza Customer</h1>
        <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
      </header>
      <div className="status ok">✓ Connecté en tant que <strong>{user.email}</strong></div>
      <div className="role-badge">Rôle : {user.role}</div>
      <pre className="payload">{JSON.stringify({ user, demo }, null, 2)}</pre>
      <p className="footer">App: <strong>web-customer</strong> · Sprint 2</p>
    </div>
  );
}

function AccessDenied({ role, onLogout }) {
  return (
    <div className="app">
      <h1>Ziza Customer</h1>
      <div className="status error">✗ Accès refusé — rôle requis : {REQUIRED_ROLE}, vous avez : {role}</div>
      <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [demo, setDemo] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // On token change: fetch /v1/me
  useEffect(() => {
    if (!token) { setUser(null); setDemo(null); return; }
    fetchMe(token)
      .then(setUser)
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); });
  }, [token]);

  // When user is set and has correct role: fetch demo
  useEffect(() => {
    if (!user || user.role !== REQUIRED_ROLE) return;
    fetchDemo(token).then(setDemo).catch(() => {});
  }, [user]);

  async function handleLogin(email, password) {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const { access_token } = await login(email, password);
      localStorage.setItem(TOKEN_KEY, access_token);
      setToken(access_token);
    } catch (e) {
      setLoginError(e.message);
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setDemo(null);
  }

  if (!token) return <LoginForm onSuccess={handleLogin} error={loginError} loading={loginLoading} />;
  if (!user) return <div className="app"><div className="status loading">⏳ Chargement…</div></div>;
  if (user.role !== REQUIRED_ROLE) return <AccessDenied role={user.role} onLogout={handleLogout} />;
  return <Dashboard user={user} demo={demo} onLogout={handleLogout} />;
}
