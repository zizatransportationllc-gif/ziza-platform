/**
 * API client for web-driver — Sprint 7.
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
// Driver profile
// ---------------------------------------------------------------------------

export async function registerDriver(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

// ---------------------------------------------------------------------------
// Trip marketplace
// ---------------------------------------------------------------------------

export async function listAvailableTrips(token) {
  const res = await fetch(`${API_BASE}/v1/trips/driver/available`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

export async function getActiveTrip(token) {
  const res = await fetch(`${API_BASE}/v1/trips/driver/active`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { trip: TripResponse | null }
}

// ---------------------------------------------------------------------------
// Trip state transitions
// ---------------------------------------------------------------------------

async function _patch(token, url) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

export const acceptTrip  = (token, id) => _patch(token, `${API_BASE}/v1/trips/${id}/accept`);
export const startTrip   = (token, id) => _patch(token, `${API_BASE}/v1/trips/${id}/start`);
export const completeTrip = (token, id) => _patch(token, `${API_BASE}/v1/trips/${id}/complete`);

// ---------------------------------------------------------------------------
// Assistance marketplace
// ---------------------------------------------------------------------------

export async function listAvailableAssistance(token) {
  const res = await fetch(`${API_BASE}/v1/assistance/driver/available`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // AssistanceResponse[]
}

export async function getActiveAssistance(token) {
  const res = await fetch(`${API_BASE}/v1/assistance/driver/active`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { request: AssistanceResponse | null }
}

export const acceptAssistance  = (token, id) => _patch(token, `${API_BASE}/v1/assistance/${id}/accept`);
export const startAssistance   = (token, id) => _patch(token, `${API_BASE}/v1/assistance/${id}/start`);
export const resolveAssistance = (token, id) => _patch(token, `${API_BASE}/v1/assistance/${id}/resolve`);

// ---------------------------------------------------------------------------
// Driver earnings — Sprint 11
// ---------------------------------------------------------------------------

export async function getMyEarnings(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/earnings`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
  // { total_xof, total_trips, today_xof, today_trips, week_xof, week_trips, recent_trips }
}

// ---------------------------------------------------------------------------
// Driver rating stats
// ---------------------------------------------------------------------------

export async function getMyRating(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/rating`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { average_stars: float|null, total_ratings: int }
}

// ---------------------------------------------------------------------------
// Legacy demo (kept for compat)
// ---------------------------------------------------------------------------

export async function fetchDemo(token) {
  const res = await fetch(`${API_BASE}/v1/demo`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}
