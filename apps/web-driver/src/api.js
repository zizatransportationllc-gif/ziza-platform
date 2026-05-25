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
// Vehicle — Sprint 12
// ---------------------------------------------------------------------------

export async function getMyVehicle(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/vehicle`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 404) return null; // no vehicle yet
  return _json(res);
}

export async function registerVehicle(token, plate, make, model, year, color) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/vehicle`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ plate, make, model, year: year ? Number(year) : null, color }),
  });
  return _json(res);
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
// Driver presence & profile — Sprint 13
// ---------------------------------------------------------------------------

export async function getDriverProfile(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/profile`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { driver_id, status, is_online, registered_at }
}

export async function setDriverOnline(token, online) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/online`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ online }),
  });
  return _json(res); // { driver_id, is_online }
}

// ---------------------------------------------------------------------------
// Driver trip history — Sprint 13
// ---------------------------------------------------------------------------

export async function listDriverTripHistory(token, limit = 20, offset = 0) {
  const res = await fetch(
    `${API_BASE}/v1/trips/driver/history?limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return _json(res); // DriverTripRecord[]
}

// ---------------------------------------------------------------------------
// Driver payout requests — Sprint 15
// ---------------------------------------------------------------------------

export async function createPayoutRequest(token, amountXof) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/payout-requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ amount_xof: Number(amountXof) }),
  });
  return _json(res); // PayoutResponse
}

export async function listPayoutRequests(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/payout-requests`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // PayoutResponse[]
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
