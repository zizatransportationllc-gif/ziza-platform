/**
 * API client for web-customer — Sprint 26.
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

// Sprint 66 — exchange a Firebase ID token for a Ziza JWT (+ refresh token).
// Used when Firebase auth is configured (VITE_FIREBASE_API_KEY present).
export async function exchangeFirebaseToken(idToken, { firstName, lastName, birthDate, phone } = {}) {
  const res = await fetch(`${API_BASE}/v1/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_token: idToken,
      role: "customer",
      first_name: firstName || null,
      last_name: lastName || null,
      date_of_birth: birthDate || null,
      phone: phone || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Authentication failed (${res.status})`);
  }
  return res.json(); // { access_token, token_type, expires_in, refresh_token }
}

export async function fetchMe(token) {
  const res = await fetch(`${API_BASE}/v1/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`/v1/me error ${res.status}`);
  return res.json();
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
      role: "customer",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Signup failed (${res.status})`);
  }
  return res.json(); // { access_token, token_type, expires_in, refresh_token }
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

export async function createTrip(token, estimateId, promoCode = null, category = "economy") {
  const body = { estimate_id: estimateId, category };
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

export async function updateProfile(token, fields) {
  const res = await fetch(`${API_BASE}/v1/profile`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(fields),
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
    // Sprint 54: Pydantic 422 returns detail as array [{loc, msg, type}]
    const detail = Array.isArray(err.detail)
      ? err.detail.map(e => e.msg || String(e)).join(', ')
      : err.detail;
    throw new Error(detail || `HTTP ${res.status}`);
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
// Trip ETA — Sprint 22
// ---------------------------------------------------------------------------

export async function getTripEta(token, tripId) {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/eta`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 404) return null; // driver location not available yet
  return _json(res); // { distance_km, eta_min, driver_lat, driver_lng, updated_at }
}

// ---------------------------------------------------------------------------
// Trip tracking — Sprint 23
// ---------------------------------------------------------------------------

/**
 * Poll driver's live position for an active trip.
 * Returns null when no location is available yet (driver hasn't pushed one).
 * Returns { trip_id, status, driver_lat, driver_lng, eta_min, updated_at }.
 */
export async function getTripTracking(token, tripId) {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/tracking`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 404) return null; // location not yet available
  return _json(res);
}

// Sprint 66 — in-app messaging (customer ↔ driver)
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

// ---------------------------------------------------------------------------
// Payment — Sprint 24
// ---------------------------------------------------------------------------

/**
 * Create a PaymentIntent for a completed trip.
 * Returns { intent_id, trip_id, amount_xof, status, checkout_url, provider_ref, … }
 */
export async function createPaymentIntent(token, tripId) {
  const res = await fetch(`${API_BASE}/v1/payments/intent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ trip_id: tripId }),
  });
  return _json(res);
}

/**
 * Get the payment intent for a trip (returns null if 404).
 */
export async function getTripPayment(token, tripId) {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/payment`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  return _json(res);
}

/**
 * Simulate payment confirmation (mock / dev mode only).
 * Calls the webhook endpoint directly with status=paid.
 */
export async function simulatePayment(providerRef) {
  const res = await fetch(`${API_BASE}/v1/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider_ref: providerRef, status: "paid" }),
  });
  return _json(res);
}

// ---------------------------------------------------------------------------
// Sprint 26 — Device token registration
// ---------------------------------------------------------------------------

/**
 * Register a device token (FCM or web-push) for push notifications.
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
// Sprint 30 — Driver application
// ---------------------------------------------------------------------------

/**
 * Submit a driver application.
 * @param {string} token
 * @param {{ full_name, phone, license_number, vehicle_make, vehicle_model, vehicle_plate, vehicle_year, vehicle_category }} data
 */
export async function submitApplication(token, data) {
  const res = await fetch(`${API_BASE}/v1/drivers/apply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });
  return _json(res); // ApplicationResponse
}

/**
 * Read the status of the authenticated user's own application.
 * Returns null if no application has been submitted.
 */
export async function getApplicationStatus(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/apply/status`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // ApplicationResponse | null
}

// ---------------------------------------------------------------------------
// Sprint 33 — Wallet
// ---------------------------------------------------------------------------

/** Get the current user's wallet balance. */
export async function getWallet(token) {
  const res = await fetch(`${API_BASE}/v1/wallet`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // WalletResponse
}

/** Top-up the wallet with a given amount (XOF). */
export async function topupWallet(token, amountXof, referenceId = null) {
  const body = { amount_xof: amountXof };
  if (referenceId) body.reference_id = referenceId;
  const res = await fetch(`${API_BASE}/v1/wallet/topup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  return _json(res); // WalletWithTxResponse
}

/** Get wallet transaction history (newest first). */
export async function getWalletTransactions(token, limit = 20, offset = 0) {
  const res = await fetch(
    `${API_BASE}/v1/wallet/transactions?limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return _json(res); // WalletTransactionResponse[]
}

// ---------------------------------------------------------------------------
// Sprint 43 — Address autocomplete (Nominatim proxy)
// ---------------------------------------------------------------------------

/**
 * Geocode a free-text address query.
 * Returns PlaceSearchResult[]: { place_id, name, address, lat, lng }
 */
export async function searchPlaces(token, query) {
  const res = await fetch(
    `${API_BASE}/v1/places/autocomplete?q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Search error (${res.status})`);
  }
  return res.json(); // PlaceSearchResult[]
}

/**
 * Sprint 45 — Check if a lat/lng is within any active service zone.
 * Public endpoint — no token required.
 * Returns { in_service: bool, city_name: str|null, city_id: str|null }
 */
export async function checkPointInService(lat, lng) {
  const res = await fetch(
    `${API_BASE}/v1/geo/point-in-service?lat=${lat}&lng=${lng}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return { in_service: true }; // fail-open: don't block on API error
  return res.json();
}

// ---------------------------------------------------------------------------
// Sprint 48 — Ziza Craft (customer side)
// ---------------------------------------------------------------------------

/**
 * Post a new craft / maintenance request.
 * { category, description, lat, lng, address?, bid_deadline_minutes? }
 */
export async function createCraftRequest(token, { category, description, lat, lng, address = null, bid_deadline_minutes = 30 }) {
  const res = await fetch(`${API_BASE}/v1/craft/requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ category, description, lat, lng, address, bid_deadline_minutes }),
  });
  return _json(res);
}

/** List the customer's own craft requests. */
export async function getMyCraftRequests(token, limit = 20, offset = 0) {
  const res = await fetch(
    `${API_BASE}/v1/craft/requests/mine?limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return _json(res);
}

/** Get a single craft request. */
export async function getCraftRequest(token, requestId) {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

/** List bids on a request (optionally sorted by proximity). */
export async function getCraftRequestBids(token, requestId, lat = null, lng = null) {
  let url = `${API_BASE}/v1/craft/requests/${requestId}/bids`;
  if (lat != null && lng != null) url += `?lat=${lat}&lng=${lng}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

/** Customer selects (accepts) a bid. */
export async function selectCraftBid(token, requestId, bidId) {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/select`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ bid_id: bidId }),
  });
  return _json(res);
}

/** Cancel a craft request. */
export async function cancelCraftRequest(token, requestId) {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}

// Sprint 66 — in-app messaging on a craft request (customer ↔ professional)
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
// Sprint 53 — Documents (KYC) — customer document submission
// ---------------------------------------------------------------------------

/** Submit a document (base64 data URL stored in url field). */
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

/** List the current user's submitted documents. */
export async function listMyDocuments(token) {
  const res = await fetch(`${API_BASE}/v1/drivers/me/documents`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res);
}
