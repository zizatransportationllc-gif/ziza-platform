/**
 * API client for web-craft — Sprint 48.
 * NOT shared across frontends (isolation rule).
 */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function _json(res) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Sprint 54: Pydantic 422 returns detail as array [{loc, msg, type}]
    const detail = Array.isArray(err.detail)
      ? err.detail.map(e => e.msg || String(e)).join(', ')
      : err.detail;
    throw new Error(detail || `HTTP ${res.status}`);
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

// Sprint 66 — exchange a Firebase ID token for a Ziza JWT (role: professional).
export async function exchangeFirebaseToken(idToken, { firstName, lastName, birthDate, phone } = {}) {
  const res = await fetch(`${API_BASE}/v1/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_token: idToken,
      role: "professional",
      first_name: firstName || null,
      last_name: lastName || null,
      date_of_birth: birthDate || null,
      phone: phone || null,
    }),
  });
  return _json(res);
}

export async function fetchMe(token) {
  const res = await fetch(`${API_BASE}/v1/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

export async function signup(email, password, firstName, lastName, birthDate, phone) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;
  const res = await fetch(`${API_BASE}/v1/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      name: fullName,
      phone: phone || null,
      first_name: firstName || null,
      last_name: lastName || null,
      date_of_birth: birthDate || null,
      role: "professional",
    }),
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
// Professional profile
// ---------------------------------------------------------------------------

export async function registerProfessional(token, specialties = "", bio = null) {
  const res = await fetch(`${API_BASE}/v1/craft/professionals/register`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ specialties, bio }),
  });
  return _json(res);
}

export async function getMyProfile(token) {
  const res = await fetch(`${API_BASE}/v1/craft/professionals/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

export async function updateMyProfile(token, updates) {
  const res = await fetch(`${API_BASE}/v1/craft/professionals/me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(updates),
  });
  return _json(res);
}

// Sprint 66 — personal profile (identity) editing via /v1/profile
export async function getProfile(token) {
  const res = await fetch(`${API_BASE}/v1/profile`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

export async function updateProfile(token, fields) {
  const res = await fetch(`${API_BASE}/v1/profile`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(fields),
  });
  return _json(res);
}

// ---------------------------------------------------------------------------
// Craft requests
// ---------------------------------------------------------------------------

export async function listOpenRequests(token, lat = 40.7357, lng = -74.1724, limit = 20, offset = 0) {
  const res = await fetch(
    `${API_BASE}/v1/craft/requests?lat=${lat}&lng=${lng}&limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return _json(res);
}

export async function getCraftRequest(token, requestId) {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

// ---------------------------------------------------------------------------
// Bids
// ---------------------------------------------------------------------------

export async function submitBid(token, requestId, priceCents, etaMin, note = null) {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/bids`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ price_cents: priceCents, eta_min: etaMin, note }),
  });
  return _json(res);
}

export async function getMyBids(token, limit = 20, offset = 0) {
  const res = await fetch(
    `${API_BASE}/v1/craft/bids/mine?limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return _json(res);
}

// Sprint 66 — in-app messaging on a craft request (professional ↔ customer)
export async function listRequestMessages(token, requestId) {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/messages`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

export async function sendRequestMessage(token, requestId, body) {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ body }),
  });
  return _json(res);
}

// ---------------------------------------------------------------------------
// Documents (KYC) — reuses driver docs endpoint
// ---------------------------------------------------------------------------

export async function submitDocument(token, type, url) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ type, url }),
  });
  return _json(res);
}

export async function listMyDocuments(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/documents`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function listNotifications(token, limit = 20, offset = 0) {
  const res = await fetch(
    `${API_BASE}/v1/notifications?limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return _json(res);
}

export async function getUnreadCount(token) {
  const res = await fetch(`${API_BASE}/v1/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

export async function markAllRead(token) {
  const res = await fetch(`${API_BASE}/v1/notifications/read-all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

// ---------------------------------------------------------------------------
// Device tokens (push notifications)
// ---------------------------------------------------------------------------

export async function registerDeviceToken(token, deviceToken, platform = "web") {
  const res = await fetch(`${API_BASE}/v1/devices/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ token: deviceToken, platform }),
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Withdrawals (payouts) — Sprint 67. Capped at available balance server-side.
// ---------------------------------------------------------------------------

export async function getProBalance(token) {
  const res = await fetch(`${API_BASE}/v1/craft/professionals/me/balance`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { professional_id, gains_cents, retraits_cents, disponible_cents }
}

export async function createProPayout(token, amountCents) {
  const res = await fetch(`${API_BASE}/v1/craft/professionals/me/payout-requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ amount_cents: amountCents }),
  });
  return _json(res);
}

export async function listProPayouts(token) {
  const res = await fetch(`${API_BASE}/v1/craft/professionals/me/payout-requests`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

// WS3 — Stripe Connect payout onboarding
export async function getConnectStatus(token) {
  const res = await fetch(`${API_BASE}/v1/payouts/connect/status`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { account_id, onboarded, payouts_enabled }
}

export async function connectOnboard(token) {
  const res = await fetch(`${API_BASE}/v1/payouts/connect/onboard`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { account_id, onboarding_url }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function formatUSD(cents) {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
