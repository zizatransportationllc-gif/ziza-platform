/**
 * API client for web-driver — Sprint 26.
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

// Sprint 66 — exchange a Firebase ID token for a Ziza JWT (role: driver).
export async function exchangeFirebaseToken(idToken, { firstName, lastName, birthDate, phone } = {}) {
  const res = await fetch(`${API_BASE}/v1/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_token: idToken,
      role: "driver",
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
      role: "driver",
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
export const markArrived = (token, id) => _patch(token, `${API_BASE}/v1/trips/${id}/arrived`);
export const completeTrip = (token, id) => _patch(token, `${API_BASE}/v1/trips/${id}/complete`);

// ---------------------------------------------------------------------------
// Driver earnings — Sprint 11
// ---------------------------------------------------------------------------

export async function getMyEarnings(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/earnings`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
  // { total_cents, total_trips, today_cents, today_trips, week_cents, week_trips, recent_trips }
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

export async function registerVehicle(token, plate, make, model, year, color, category = "economy") {
  const res = await fetch(`${API_BASE}/v1/drivers/me/vehicle`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ plate, make, model, year: year ? Number(year) : null, color, category }),
  });
  return _json(res);
}

// ---------------------------------------------------------------------------
// Vehicle categories — Sprint 21
// ---------------------------------------------------------------------------

export async function listCategories(token) {
  const res = await fetch(`${API_BASE}/v1/categories`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // CategoryInfo[]
}

// ---------------------------------------------------------------------------
// Driver location — Sprint 22
// ---------------------------------------------------------------------------

export async function updateDriverLocation(token, lat, lng) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/location`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ lat, lng }),
  });
  return _json(res); // LocationResponse
}

export async function getDriverLocation(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/location`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  return _json(res); // LocationResponse | null
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
    body: JSON.stringify({ amount_cents: Number(amountXof) }),
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
// Driver documents (KYC) — Sprint 17
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
  return _json(res); // DocumentResponse
}

export async function listMyDocuments(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/documents`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // DocumentResponse[]
}

// ---------------------------------------------------------------------------
// Notifications — Sprint 18
// ---------------------------------------------------------------------------

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

export async function deleteNotification(token, notificationId) {
  const res = await fetch(`${API_BASE}/v1/notifications/${notificationId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
  return true;
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

// ---------------------------------------------------------------------------
// Sprint 26 — Device token registration
// ---------------------------------------------------------------------------

/**
 * Register a device token (FCM or web-push endpoint) for push notifications.
 * Idempotent — safe to call on each login.
 */
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

/**
 * Deregister a device token (called on logout).
 */
export async function deregisterDeviceToken(token, deviceToken) {
  const res = await fetch(`${API_BASE}/v1/devices/${encodeURIComponent(deviceToken)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

// ---------------------------------------------------------------------------
// Sprint 29 — Driver net balance
// ---------------------------------------------------------------------------

/**
 * Return the driver's net available balance after commission deduction.
 * { driver_id, gains_bruts_cents, commission_cents, retraits_cents, solde_net_cents }
 */
export async function getDriverBalance(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/balance`, {
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

// Sprint 70 — Stripe Issuing debit card (spend the Connect balance)
export async function getIssuingCard(token) {
  const res = await fetch(`${API_BASE}/v1/payouts/issuing/card`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  return _json(res); // { card_id, last4, status, owner_role, ... }
}

export async function issueIssuingCard(token) {
  const res = await fetch(`${API_BASE}/v1/payouts/issuing/card`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

export async function setIssuingCardStatus(token, active) {
  const res = await fetch(`${API_BASE}/v1/payouts/issuing/card/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ active }),
  });
  return _json(res);
}

// ---------------------------------------------------------------------------
// Sprint 66 — personal profile (identity) editing
// ---------------------------------------------------------------------------

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
  return _json(res); // { account_holder_name, routing_number, account_number_last4, ... }
}

export async function setBankAccount(token, fields) {
  const res = await fetch(`${API_BASE}/v1/profile/bank-account`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(fields),
  });
  return _json(res);
}

// Sprint 66 — in-app messaging (driver ↔ customer)
export async function listTripMessages(token, tripId) {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/messages`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

export async function sendTripMessage(token, tripId, body) {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ body }),
  });
  return _json(res);
}
