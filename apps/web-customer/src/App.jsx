import { useEffect, useState } from "react";
import { login, fetchMe, fetchDemo, registerUser } from "./api";
import { firebaseEnabled, signInWithGoogle, firebaseSignOut } from "./auth";

const REQUIRED_ROLE = "customer";
const TOKEN_KEY = "ziza_token";

function LoginForm({ onEmailLogin, onGoogleLogin, error, loading }) {
  const [email, setEmail] = useState("customer@ziza.dev");
  const [password, setPassword] = useState("ziza2024");
  return (
    <div className="app">
      <h1>Ziza Customer</h1>
      <p className="subtitle">Sprint 3 — Auth DEV + Firebase</p>
      <form className="login-form" onSubmit={(e) => { e.preventDefault(); onEmailLogin(email, password); }}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
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

function Dashboard({ user, demo, onLogout }) {
  return (
    <div className="app">
      <header className="dash-header">
        <h1>Ziza Customer</h1>
        <button className="logout-btn" onClick={onLogout}>Déconnexion</button>
      </header>
      <div className="status ok">✓ Connecté — <strong>{user.email}</strong></div>
      <div className="role-badge">{user.role} · {user.provider}</div>
      <pre className="payload">{JSON.stringify({ user, demo }, null, 2)}</pre>
      <p className="footer">App: <strong>web-customer</strong> · Sprint 3</p>
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

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [demo, setDemo] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (!token) { setUser(null); setDemo(null); return; }
    fetchMe(token).then(setUser).catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); });
  }, [token]);

  useEffect(() => {
    if (!user || user.role !== REQUIRED_ROLE) return;
    registerUser(token).catch(() => {});
    fetchDemo(token).then(setDemo).catch(() => {});
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
    localStorage.removeItem(TOKEN_KEY); setToken(null); setUser(null); setDemo(null);
  }

  if (!token) return <LoginForm onEmailLogin={handleEmailLogin} onGoogleLogin={handleGoogleLogin} error={loginError} loading={loginLoading} />;
  if (!user) return <div className="app"><div className="status loading">⏳ Chargement…</div></div>;
  if (user.role !== REQUIRED_ROLE) return <AccessDenied role={user.role} onLogout={handleLogout} />;
  return <Dashboard user={user} demo={demo} onLogout={handleLogout} />;
}
