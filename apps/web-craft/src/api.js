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

// Sprint 69 — profile photo + bank account
export async function avatarUploadUrl(token, filename, contentType) {
  const res = await fetch(`${API_BASE}/v1/profile/avatar-upload-url`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ filename, content_type: contentType }),
  });
  return _json(res); // { upload_url, final_url }
}

export async function getBankAccount(token) {
  const res = await fetch(`${API_BASE}/v1/profile/bank-account`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  return _json(res);
}

export async function setBankAccount(token, fields) {
  const res = await fetch(`${API_BASE}/v1/profile/bank-account`, {
    method: "PUT",
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

// ETA is computed by the system from the professional's position to the
// customer, so we send the pro's GPS instead of asking them for a number.
export async function submitBid(token, requestId, priceCents, note = null, pos = null) {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/bids`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      price_cents: priceCents,
      note,
      professional_lat: pos?.lat ?? null,
      professional_lng: pos?.lng ?? null,
    }),
  });
  return _json(res);
}

// Pro lifecycle actions on an assigned job.
async function _craftPatch(token, path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}
export const craftMarkArrived = (token, id) => _craftPatch(token, `/v1/craft/requests/${id}/arrived`);
export const craftWorkDone    = (token, id) => _craftPatch(token, `/v1/craft/requests/${id}/work-done`);

export async function getMyBids(token, limit = 20, offset = 0) {
  const res = await fetch(
    `${API_BASE}/v1/craft/bids/mine?limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return _json(res);
}

// Reverse-geocode a GPS point to a readable address (PlaceSearchResult | null).
export async function reverseGeocode(token, lat, lng) {
  try {
    const res = await fetch(`${API_BASE}/v1/places/reverse?lat=${lat}&lng=${lng}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// --- Before/after photos -----------------------------------------------------
export async function listCraftPhotos(token, requestId) {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/photos`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

/** Get a signed URL, PUT the file to GCS, then record the photo. */
export async function uploadCraftPhoto(token, requestId, kind, file) {
  const urlRes = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/photos/upload-url`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ kind, content_type: file.type, filename: file.name }),
  });
  const { upload_url, final_url } = await _json(urlRes);
  // In dev (mock GCS) there is no bucket to PUT to — skip the upload step.
  if (!upload_url.includes("/mock-gcs")) {
    const put = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
    if (!put.ok) throw new Error("Photo upload failed");
  }
  const recRes = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/photos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ kind, url: final_url }),
  });
  return _json(recRes);
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

export async function deleteNotification(token, notificationId) {
  const res = await fetch(`${API_BASE}/v1/notifications/${notificationId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
  return true;
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
