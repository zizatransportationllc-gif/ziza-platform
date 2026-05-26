/**
 * API client for web-customer — Sprint 20.
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

export async function createTrip(token, estimateId, promoCode = null) {
  const body = { estimate_id: estimateId };
  if (promoCode) body.promo_code = promoCode;
  const res = await fetch(`${API_BASE}/v1/trips`, {
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

// ---------------------------------------------------------------------------
// Promo codes — Sprint 14
// ---------------------------------------------------------------------------

export async function validatePromo(token, code) {
  const res = await fetch(`${API_BASE}/v1/promos/validate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Promo error (${res.status})`);
  }
  return res.json(); // { valid, code, discount_pct }
}

// ---------------------------------------------------------------------------
// User profile — Sprint 16
// ---------------------------------------------------------------------------

export async function getProfile(token) {
  const res = await fetch(`${API_BASE}/v1/profile`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Get profile error (${res.status})`);
  }
  return res.json(); // UserProfileResponse
}

export async function updateProfile(token, name, phone) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (phone !== undefined) body.phone = phone;
  const res = await fetch(`${API_BASE}/v1/profile`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Update profile error (${res.status})`);
  }
  return res.json(); // UserProfileResponse
}

// ---------------------------------------------------------------------------
// Notifications — Sprint 18
// ---------------------------------------------------------------------------

async function _json(res) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function listNotifications(token, limit = 20, offset = 0) {
  const res = await fetch(`${API_BASE}/v1/notifications?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // NotificationRecord[]
}

export async function getUnreadCount(token) {
  const res = await fetch(`${API_BASE}/v1/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { count: int }
}

export async function markAllRead(token) {
  const res = await fetch(`${API_BASE}/v1/notifications/read-all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { marked: int }
}

// ---------------------------------------------------------------------------
// Customer trip history — Sprint 13
// ---------------------------------------------------------------------------

export async function listMyTrips(token, limit = 20, offset = 0) {
  const res = await fetch(`${API_BASE}/v1/trips?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `List trips error (${res.status})`);
  }
  return res.json(); // TripResponse[]
}

// ---------------------------------------------------------------------------
// Saved places — Sprint 20
// ---------------------------------------------------------------------------

export async function listPlaces(token) {
  const res = await fetch(`${API_BASE}/v1/places`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // SavedPlaceResponse[]
}

export async function createPlace(token, label, name, lat, lng) {
  const res = await fetch(`${API_BASE}/v1/places`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ label, name, lat, lng }),
  });
  return _json(res); // SavedPlaceResponse
}

export async function updatePlace(token, placeId, fields) {
  // fields: { label?, name?, lat?, lng? }
  const res = await fetch(`${API_BASE}/v1/places/${placeId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(fields),
  });
  return _json(res); // SavedPlaceResponse
}

export async function deletePlace(token, placeId) {
  const res = await fetch(`${API_BASE}/v1/places/${placeId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Delete place error (${res.status})`);
  }
  // 204 No Content — no body
}
