import { useEffect, useState } from "react";
import { fetchDemo } from "./api";

export default function App() {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    fetchDemo()
      .then((data) => setState({ status: "ok", data, error: null }))
      .catch((err) => setState({ status: "error", data: null, error: err.message }));
  }, []);

  return (
    <div className="app">
      <h1>Ziza Admin Demo</h1>
      <p className="subtitle">Sprint 1 — Demo Deployable Foundation</p>

      {state.status === "loading" && <div className="status loading">⏳ Contacting API…</div>}
      {state.status === "ok" && <div className="status ok">✓ API reachable</div>}
      {state.status === "error" && <div className="status error">✗ API unreachable</div>}

      <pre className="payload">
        {state.status === "ok" && JSON.stringify(state.data, null, 2)}
        {state.status === "error" && state.error}
      </pre>

      <p className="footer">App: <strong>web-admin</strong> · Standalone build</p>
    </div>
  );
}
