/**
 * API client for web-customer — Sprint 2.
 * NOT shared across frontends (isolation rule).
 */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Auth helpers
export async function login(email, password) {
  const res = await fetch(`${API_BASE}/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Login failed (${res.status})`);
  }
  return res.json(); // { access_token, token_type }
}

export async function fetchMe(token) {
  const res = await fetch(`${API_BASE}/v1/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`/v1/me error ${res.status}`);
  return res.json();
}

export async function registerUser(token) {
  const res = await fetch(`${API_BASE}/v1/auth/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`/v1/auth/register error ${res.status}`);
  return res.json();
}

export async function fetchEstimate(token, originLat, originLng, destLat, destLng) {
  const res = await fetch(`${API_BASE}/v1/estimate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      origin_lat: originLat,
      origin_lng: originLng,
      dest_lat: destLat,
      dest_lng: destLng,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Estimate error (${res.status})`);
  }
  return res.json();
}

export async function createTrip(token, estimateId) {
  const res = await fetch(`${API_BASE}/v1/trips`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ estimate_id: estimateId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Trip creation error (${res.status})`);
  }
  return res.json();
}

export async function getTrip(token, tripId) {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Get trip error (${res.status})`);
  }
  return res.json();
}

export async function cancelTrip(token, tripId) {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/cancel`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Cancel trip error (${res.status})`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Roadside assistance
// ---------------------------------------------------------------------------

export async function createAssistanceRequest(token, type, lat, lng, note) {
  const body = { type, lat, lng };
  if (note) body.note = note;
  const res = await fetch(`${API_BASE}/v1/assistance`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Assistance error (${res.status})`);
  }
  return res.json();
}

export async function getAssistanceRequest(token, reqId) {
  const res = await fetch(`${API_BASE}/v1/assistance/${reqId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Get assistance error (${res.status})`);
  }
  return res.json();
}

export async function cancelAssistanceRequest(token, reqId) {
  const res = await fetch(`${API_BASE}/v1/assistance/${reqId}/cancel`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Cancel assistance error (${res.status})`);
  }
  return res.json();
}

export async function rateTrip(token, tripId, stars, comment) {
  const body = { stars };
  if (comment) body.comment = comment;
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/rate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Rate trip error (${res.status})`);
  }
  return res.json();
}

export async function getTripRating(token, tripId) {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/rating`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Get rating error (${res.status})`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Customer assistance history — Sprint 12
// ---------------------------------------------------------------------------

export async function listMyAssistance(token) {
  const res = await fetch(`${API_BASE}/v1/assistance`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `List assistance error (${res.status})`);
  }
  return res.json(); // AssistanceResponse[]
}

export async function fetchDemo(token) {
  const res = await fetch(`${API_BASE}/v1/demo`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json();
}
