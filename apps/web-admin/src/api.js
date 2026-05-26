/**
 * API client for web-admin — Sprint 19.
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

/**
 * Sprint 19: added status_filter, customer_email, date_from, date_to filters.
 * @param {string|null} statusFilter - "pending"|"accepted"|"in_progress"|"completed"|"cancelled"|null
 * @param {string|null} customerEmail - partial match (case-insensitive)
 * @param {string|null} dateFrom - ISO date string (YYYY-MM-DD)
 * @param {string|null} dateTo   - ISO date string (YYYY-MM-DD)
 */
export async function adminListTrips(
  token,
  limit = 50,
  offset = 0,
  statusFilter = null,
  customerEmail = null,
  dateFrom = null,
  dateTo = null,
) {
  const params = new URLSearchParams({ limit, offset });
  if (statusFilter)  params.set("status_filter",  statusFilter);
  if (customerEmail) params.set("customer_email", customerEmail);
  if (dateFrom)      params.set("date_from",       dateFrom);
  if (dateTo)        params.set("date_to",         dateTo);
  const res = await fetch(`${API_BASE}/v1/admin/trips?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // AdminTripRecord[]
}

// ---------------------------------------------------------------------------
// Admin — users — Sprint 12
// ---------------------------------------------------------------------------

/**
 * Sprint 19: added role and email filters.
 * @param {string|null} role  - "admin"|"driver"|"customer"|null
 * @param {string|null} email - partial match (case-insensitive)
 */
export async function adminListUsers(token, role = null, email = null) {
  const params = new URLSearchParams();
  if (role)  params.set("role",  role);
  if (email) params.set("email", email);
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/v1/admin/users${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // AdminUserRecord[]
}

// ---------------------------------------------------------------------------
// Admin — assistance list — Sprint 13
// ---------------------------------------------------------------------------

export async function adminListAssistance(token, limit = 50, offset = 0) {
  const res = await fetch(`${API_BASE}/v1/admin/assistance?limit=${limit}&offset=${offset}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // AdminAssistanceRecord[]
}

// ---------------------------------------------------------------------------
// Admin — promo codes — Sprint 14
// ---------------------------------------------------------------------------

export async function adminCreatePromo(token, code, discountPct, maxUses, expiresAt) {
  const body = { code, discount_pct: discountPct };
  if (maxUses) body.max_uses = Number(maxUses);
  if (expiresAt) body.expires_at = expiresAt;
  const res = await fetch(`${API_BASE}/v1/admin/promos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  return _json(res); // PromoResponse
}

export async function adminListPromos(token) {
  const res = await fetch(`${API_BASE}/v1/admin/promos`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // PromoResponse[]
}

export async function adminDeactivatePromo(token, code) {
  const res = await fetch(`${API_BASE}/v1/admin/promos/${encodeURIComponent(code)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // PromoResponse (active=false)
}

// ---------------------------------------------------------------------------
// Admin — payout requests — Sprint 15
// ---------------------------------------------------------------------------

export async function adminListPayouts(token, limit = 50, offset = 0) {
  const res = await fetch(
    `${API_BASE}/v1/admin/payout-requests?limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return _json(res); // AdminPayoutRecord[]
}

export async function adminUpdatePayoutStatus(token, payoutId, newStatus, noteAdmin = null) {
  const body = { status: newStatus };
  if (noteAdmin) body.note_admin = noteAdmin;
  const res = await fetch(`${API_BASE}/v1/admin/payout-requests/${payoutId}/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  return _json(res); // PayoutResponse
}

// ---------------------------------------------------------------------------
// Admin — ratings view — Sprint 15
// ---------------------------------------------------------------------------

export async function adminListRatings(token, limit = 50, offset = 0) {
  const res = await fetch(
    `${API_BASE}/v1/admin/ratings?limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return _json(res); // AdminRatingRecord[]
}

// ---------------------------------------------------------------------------
// Admin — surge pricing — Sprint 16
// ---------------------------------------------------------------------------

export async function adminGetSurge(token) {
  const res = await fetch(`${API_BASE}/v1/admin/settings/surge`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { surge_multiplier: float }
}

export async function adminSetSurge(token, surgeMultiplier) {
  const res = await fetch(`${API_BASE}/v1/admin/settings/surge`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ surge_multiplier: surgeMultiplier }),
  });
  return _json(res); // { surge_multiplier: float }
}

// ---------------------------------------------------------------------------
// Admin — driver documents — Sprint 17
// ---------------------------------------------------------------------------

export async function adminListDocuments(token, limit = 50, offset = 0) {
  const res = await fetch(
    `${API_BASE}/v1/admin/documents?limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  return _json(res); // AdminDocumentRecord[]
}

export async function adminUpdateDocumentStatus(token, documentId, newStatus, noteAdmin = null) {
  const body = { status: newStatus };
  if (noteAdmin) body.note_admin = noteAdmin;
  const res = await fetch(`${API_BASE}/v1/admin/documents/${documentId}/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  return _json(res); // DocumentResponse
}

export async function adminGetPendingCounts(token) {
  const res = await fetch(`${API_BASE}/v1/admin/pending-counts`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { payout_requests: int, documents: int }
}

export async function adminSetDriverStatus(token, driverId, newStatus) {
  const res = await fetch(`${API_BASE}/v1/admin/drivers/${driverId}/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ status: newStatus }),
  });
  return _json(res); // { driver_id, status }
}

// ---------------------------------------------------------------------------
// Sprint 29 — Commission & Payout batch
// ---------------------------------------------------------------------------

/** List all commission settings (admin only). */
export async function getCommissionSettings(token) {
  const res = await fetch(`${API_BASE}/v1/admin/commission`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // [{ category, rate_pct, effective_from }]
}

/** Create or update a commission rate (admin only). */
export async function setCommission(token, category, rate_pct) {
  const res = await fetch(`${API_BASE}/v1/admin/commission`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ category, rate_pct }),
  });
  return _json(res); // { category, rate_pct, effective_from }
}

/** Run the batch payout for all approved payout requests. */
export async function runPayoutBatch(token) {
  const res = await fetch(`${API_BASE}/v1/admin/payouts/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // { processed, failed, total_net_xof, total_commission_xof }
}

// ---------------------------------------------------------------------------
// Sprint 30 — Driver Applications
// ---------------------------------------------------------------------------

/** List all driver applications, optionally filtered by status. */
export async function adminListApplications(token, statusFilter = null, limit = 50, offset = 0) {
  const params = new URLSearchParams({ limit, offset });
  if (statusFilter) params.set("status_filter", statusFilter);
  const res = await fetch(`${API_BASE}/v1/admin/applications?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // ApplicationResponse[]
}

/** Get a single application by ID. */
export async function adminGetApplication(token, applicationId) {
  const res = await fetch(`${API_BASE}/v1/admin/applications/${applicationId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // ApplicationResponse
}

/** Approve, reject, or set an application to under_review. */
export async function adminReviewApplication(token, applicationId, newStatus, notesAdmin = null) {
  const body = { status: newStatus };
  if (notesAdmin) body.notes_admin = notesAdmin;
  const res = await fetch(`${API_BASE}/v1/admin/applications/${applicationId}/review`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  return _json(res); // ApplicationResponse
}

// ---------------------------------------------------------------------------
// Sprint 31 — Feature Flags
// ---------------------------------------------------------------------------

/** List all feature flags (seeds defaults on first call). */
export async function adminListFlags(token) {
  const res = await fetch(`${API_BASE}/v1/admin/flags`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // FeatureFlagResponse[]
}

/** Update a feature flag (enabled, rollout_pct, description). */
export async function adminSetFlag(token, flagName, updates) {
  const res = await fetch(`${API_BASE}/v1/admin/flags/${flagName}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(updates),
  });
  return _json(res); // FeatureFlagResponse
}

// ---------------------------------------------------------------------------
// Sprint 31 — Live Drivers
// ---------------------------------------------------------------------------

/** List all currently online drivers with their last known location. */
export async function adminListLiveDrivers(token) {
  const res = await fetch(`${API_BASE}/v1/admin/drivers/live`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return _json(res); // LiveDriverResponse[]
}

// ---------------------------------------------------------------------------
// Sprint 31 — Role Management
// ---------------------------------------------------------------------------

/** Change the role of any user (admin cannot change their own role). */
export async function adminSetUserRole(token, userId, role) {
  const res = await fetch(`${API_BASE}/v1/admin/users/${userId}/role`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ role }),
  });
  return _json(res); // { user_id, role, updated_by }
}

// ---------------------------------------------------------------------------
// Sprint 31 — Invite Codes
// ---------------------------------------------------------------------------

/** Create a new invite code (admin only). */
export async function adminCreateInviteCode(token, code, maxUses = 1) {
  const res = await fetch(`${API_BASE}/v1/admin/invite-codes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ code, max_uses: maxUses }),
  });
  return _json(res); // InviteCodeResponse
}
