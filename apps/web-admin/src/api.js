/**
 * API client for web-admin — Sprint 10.
 * NOT shared across frontends (isolation rule).
 */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function _json(res) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return _json(res);
}

export async function fetchMe(token) {
  const res = await fetch(`${API_BASE}/v1/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

export async function registerUser(token) {
  const res = await fetch(`${API_BASE}/v1/auth/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

// ---------------------------------------------------------------------------
// Admin — drivers
// ---------------------------------------------------------------------------

export async function adminListDrivers(token) {
  const res = await fetch(`${API_BASE}/v1/admin/drivers`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // AdminDriverRecord[]
}

export async function adminSetDriverCapabilities(token, driverId, capabilities) {
  const res = await fetch(`${API_BASE}/v1/admin/drivers/${driverId}/capabilities`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ capabilities }),
  });
  return _json(res); // { capabilities: string[] }
}

// ---------------------------------------------------------------------------
// Admin — statistics & trips — Sprint 11
// ---------------------------------------------------------------------------

export async function adminGetStats(token) {
  const res = await fetch(`${API_BASE}/v1/admin/stats`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
  // { trips: { total, by_status, total_revenue_xof }, assistance: { total, by_status }, drivers: { total, by_status } }
}

export async function adminListTrips(token, limit = 50, offset = 0) {
  const res = await fetch(`${API_BASE}/v1/admin/trips?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // AdminTripRecord[]
}

// ---------------------------------------------------------------------------
// Admin — users — Sprint 12
// ---------------------------------------------------------------------------

export async function adminListUsers(token) {
  const res = await fetch(`${API_BASE}/v1/admin/users`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // AdminUserRecord[]
}
