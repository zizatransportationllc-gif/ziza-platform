/**
 * API client for mobile-customer — Sprint 40.
 * Isolated per frontend-isolation rule (no shared code with web frontends).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE =
  (process.env.EXPO_PUBLIC_API_URL as string) || "http://localhost:8000";

const TOKEN_KEY = "ziza_access_token";
const REFRESH_TOKEN_KEY = "ziza_refresh_token";

// ---------------------------------------------------------------------------
// Error type — carries HTTP status for 401 detection
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function _json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // Sprint 54: Pydantic 422 returns detail as array [{loc, msg, type}]
    const rawDetail = (err as any).detail;
    const detail = Array.isArray(rawDetail)
      ? rawDetail.map((e: any) => e.msg || String(e)).join(', ')
      : rawDetail;
    throw new ApiError(res.status, detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function _auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface CategoryInfo {
  category_id: string;
  name: string;
  description: string;
  base_fare_cents: number;
  per_km_cents: number;
}

export interface EstimateResponse {
  estimate_id: string;
  price_cents: number;
  distance_km: number;
  duration_min: number;
  category_id: string;
  expires_at: string;
}

export interface TripResponse {
  trip_id: string;
  status: string;
  driver_id: string | null;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  price_cents: number;
  eta_minutes: number | null;
  verification_code: string | null;  // shared pickup code (customer ↔ driver)
  paid_at: string | null;  // Sprint 42: set when payment is confirmed
  created_at: string;
}

export interface DriverPosition {
  driver_id: string;
  lat: number;
  lng: number;
  updated_at: string;
}

export interface PaymentIntentResponse {
  intent_id: string;
  trip_id: string;
  amount_cents: number;
  provider: string;
  provider_ref: string;
  checkout_url: string;
  status: string;  // "pending" | "paid" | "failed"
  created_at: string;
  updated_at: string;
}

export interface PromoResponse {
  promo_code: string;
  discount_cents: number;
  final_price_cents: number;
}


export interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface NotificationRecord {
  notification_id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  channel: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export async function storeToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/** Store access + refresh tokens together (token rotation). */
export async function storeTokenPair(
  accessToken: string,
  refreshToken: string | null | undefined
): Promise<void> {
  const pairs: [string, string][] = [[TOKEN_KEY, accessToken]];
  if (refreshToken) pairs.push([REFRESH_TOKEN_KEY, refreshToken]);
  await AsyncStorage.multiSet(pairs);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Clear both tokens (used on logout / session expiry). */
export async function clearTokenPair(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY]);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(
  email: string,
  password: string
): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await _json<TokenResponse>(res);
  await storeTokenPair(data.access_token, data.refresh_token);
  return data;
}

/** Sprint 64 — create a new customer account. */
export async function signup(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  birthDate: string,
  phone: string | null = null
): Promise<TokenResponse> {
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
  const data = await _json<TokenResponse>(res);
  await storeTokenPair(data.access_token, data.refresh_token);
  return data;
}

/** Sprint 66 — exchange a Firebase ID token for a Ziza JWT (role: customer). */
export async function exchangeFirebaseToken(
  idToken: string,
  opts: { firstName?: string; lastName?: string; birthDate?: string; phone?: string | null } = {}
): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/v1/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_token: idToken,
      role: "customer",
      first_name: opts.firstName || null,
      last_name: opts.lastName || null,
      date_of_birth: opts.birthDate || null,
      phone: opts.phone || null,
    }),
  });
  const data = await _json<TokenResponse>(res);
  await storeTokenPair(data.access_token, data.refresh_token);
  return data;
}

export async function logout(token: string): Promise<void> {
  // Send the stored refresh token so the server can revoke it
  const refreshToken = await getStoredRefreshToken();
  await fetch(`${API_BASE}/v1/auth/logout`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken ?? "" }),
  }).catch(() => {});
  await clearTokenPair();
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await _json<TokenResponse>(res);
  // Store the rotated token pair (new access + new refresh)
  await storeTokenPair(data.access_token, data.refresh_token);
  return data;
}

export interface MeResponse {
  id: string;
  user_id: string;
  email: string;
  role: string;
  provider: string;
}

/** Lightweight token validation — returns the authenticated user's claims. */
export async function fetchMe(token: string): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/v1/me`, { headers: _auth(token) });
  return _json<MeResponse>(res);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(token: string): Promise<CategoryInfo[]> {
  const res = await fetch(`${API_BASE}/v1/categories`, {
    headers: _auth(token),
  });
  return _json<CategoryInfo[]>(res);
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

export async function getEstimate(
  token: string,
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  categoryId?: string
): Promise<EstimateResponse> {
  const body: Record<string, unknown> = {
    origin_lat: originLat,
    origin_lng: originLng,
    dest_lat: destLat,
    dest_lng: destLng,
  };
  if (categoryId) body.category_id = categoryId;
  const res = await fetch(`${API_BASE}/v1/estimate`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return _json<EstimateResponse>(res);
}

export async function applyPromo(
  token: string,
  code: string,
  estimateId: string
): Promise<PromoResponse> {
  const res = await fetch(`${API_BASE}/v1/promo/apply`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ code, estimate_id: estimateId }),
  });
  return _json<PromoResponse>(res);
}

export async function createTrip(
  token: string,
  estimateId: string
): Promise<TripResponse> {
  const res = await fetch(`${API_BASE}/v1/trips`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ estimate_id: estimateId }),
  });
  return _json<TripResponse>(res);
}

export async function getTripStatus(
  token: string,
  tripId: string
): Promise<TripResponse> {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}`, {
    headers: _auth(token),
  });
  return _json<TripResponse>(res);
}

export async function cancelTrip(
  token: string,
  tripId: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/cancel`, {
    method: "PATCH",
    headers: _auth(token),
  });
  await _json<unknown>(res);
}

export async function listTripHistory(
  token: string,
  limit = 20,
  offset = 0
): Promise<TripResponse[]> {
  const res = await fetch(
    `${API_BASE}/v1/trips/customer/history?limit=${limit}&offset=${offset}`,
    { headers: _auth(token) }
  );
  return _json<TripResponse[]>(res);
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export async function getDriverPosition(
  token: string,
  driverId: string
): Promise<DriverPosition | null> {
  const res = await fetch(`${API_BASE}/v1/drivers/${driverId}/location`, {
    headers: _auth(token),
  });
  if (res.status === 404) return null;
  return _json<DriverPosition>(res);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function createPaymentIntent(
  token: string,
  tripId: string
): Promise<PaymentIntentResponse> {
  const res = await fetch(`${API_BASE}/v1/payments/intent`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ trip_id: tripId }),
  });
  return _json<PaymentIntentResponse>(res);
}

export async function getPaymentStatus(
  token: string,
  tripId: string
): Promise<{ status: string; provider_ref: string }> {
  const res = await fetch(`${API_BASE}/v1/payments/${tripId}/status`, {
    headers: _auth(token),
  });
  return _json<{ status: string; provider_ref: string }>(res);
}

/** Sprint 41 — fetch payment intent by trip_id. Returns null if no intent yet. */
export async function getTripPayment(
  token: string,
  tripId: string
): Promise<PaymentIntentResponse | null> {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/payment`, {
    headers: _auth(token),
  });
  if (res.status === 404) return null;
  return _json<PaymentIntentResponse>(res);
}

// ---------------------------------------------------------------------------
// Places (autocomplete)
// ---------------------------------------------------------------------------

export async function searchPlaces(
  token: string,
  query: string
): Promise<PlaceResult[]> {
  const res = await fetch(
    `${API_BASE}/v1/places/autocomplete?q=${encodeURIComponent(query)}`,
    { headers: _auth(token) }
  );
  return _json<PlaceResult[]>(res);
}

// ---------------------------------------------------------------------------
// Geo — Sprint 45: zone coverage check
// ---------------------------------------------------------------------------

export interface ZoneCoverageResult {
  lat: number;
  lng: number;
  in_service: boolean;
  city_name: string | null;
  city_id: string | null;
}

/**
 * Check if a lat/lng point is within any active service zone.
 * Public endpoint — no auth token required.
 * Fails open (returns in_service=true) on any network error.
 */
export async function checkPointInService(
  lat: number,
  lng: number
): Promise<ZoneCoverageResult> {
  try {
    const res = await fetch(
      `${API_BASE}/v1/geo/point-in-service?lat=${lat}&lng=${lng}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return { lat, lng, in_service: true, city_name: null, city_id: null };
    return res.json() as Promise<ZoneCoverageResult>;
  } catch {
    // Fail-open: don't block the user on network errors
    return { lat, lng, in_service: true, city_name: null, city_id: null };
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function listNotifications(
  token: string,
  limit = 20,
  offset = 0
): Promise<NotificationRecord[]> {
  const res = await fetch(
    `${API_BASE}/v1/notifications?limit=${limit}&offset=${offset}`,
    { headers: _auth(token) }
  );
  return _json<NotificationRecord[]>(res);
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  await fetch(`${API_BASE}/v1/notifications/read-all`, {
    method: "PATCH",
    headers: _auth(token),
  });
}

export async function deleteNotification(token: string, notificationId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/notifications/${notificationId}`, {
    method: "DELETE",
    headers: _auth(token),
  });
  if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
}

// ---------------------------------------------------------------------------
// Device tokens (push notifications)
// ---------------------------------------------------------------------------

export async function registerDeviceToken(
  token: string,
  deviceToken: string,
  platform: "web" | "ios" | "android" = "android"
): Promise<void> {
  await fetch(`${API_BASE}/v1/devices/register`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ token: deviceToken, platform }),
  });
}

export async function deregisterDeviceToken(
  token: string,
  deviceToken: string
): Promise<void> {
  await fetch(
    `${API_BASE}/v1/devices/${encodeURIComponent(deviceToken)}`,
    { method: "DELETE", headers: _auth(token) }
  );
}

// ---------------------------------------------------------------------------
// Sprint 47 — Ziza Craft (customer side)
// ---------------------------------------------------------------------------

export interface CraftRequest {
  request_id: string;
  customer_id: string;
  category: string;
  description: string;
  lat: number;
  lng: number;
  address: string | null;
  status: string;
  bid_deadline: string | null;
  selected_bid_id: string | null;
  created_at: string;
  updated_at: string;
  distance_km: number | null;
}

export interface CraftBid {
  bid_id: string;
  request_id: string;
  professional_id: string;
  price_cents: number;
  eta_min: number;
  note: string | null;
  professional_lat: number | null;
  professional_lng: number | null;
  status: string;
  created_at: string;
  distance_km: number | null;
}

export const CRAFT_CATEGORIES = [
  "breakdown",    // General breakdown / car won't start
  "flat_tyre",    // Flat or punctured tire
  "tow",          // Towing to garage or safe location
  "fuel",         // Out of fuel — emergency delivery
  "lockout",      // Keys locked inside the vehicle
  "battery",      // Dead battery — jump-start or replacement
  "accident",     // Post-accident assistance / scene management
  "diagnostics",  // On-site electronic / OBD diagnostics
  "other",        // Any other vehicle intervention
] as const;

export type CraftCategory = typeof CRAFT_CATEGORIES[number];

export async function createCraftRequest(
  token: string,
  body: {
    category: string;
    description: string;
    lat: number;
    lng: number;
    address?: string | null;
    bid_deadline_minutes?: number;
  }
): Promise<CraftRequest> {
  const res = await fetch(`${API_BASE}/v1/craft/requests`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return _json<CraftRequest>(res);
}

export async function getMyCraftRequests(
  token: string,
  limit = 20,
  offset = 0
): Promise<CraftRequest[]> {
  const res = await fetch(
    `${API_BASE}/v1/craft/requests/mine?limit=${limit}&offset=${offset}`,
    { headers: _auth(token) }
  );
  return _json<CraftRequest[]>(res);
}

export async function getCraftRequest(
  token: string,
  requestId: string
): Promise<CraftRequest> {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}`, {
    headers: _auth(token),
  });
  return _json<CraftRequest>(res);
}

export async function getBidsForRequest(
  token: string,
  requestId: string,
  customerLat?: number,
  customerLng?: number
): Promise<CraftBid[]> {
  let url = `${API_BASE}/v1/craft/requests/${requestId}/bids`;
  if (customerLat != null && customerLng != null) {
    url += `?customer_lat=${customerLat}&customer_lng=${customerLng}`;
  }
  const res = await fetch(url, { headers: _auth(token) });
  return _json<CraftBid[]>(res);
}

export async function selectCraftBid(
  token: string,
  requestId: string,
  bidId: string
): Promise<CraftRequest> {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/select`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ bid_id: bidId }),
  });
  return _json<CraftRequest>(res);
}

export async function cancelCraftRequest(
  token: string,
  requestId: string
): Promise<CraftRequest> {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/cancel`, {
    method: "POST",
    headers: _auth(token),
  });
  return _json<CraftRequest>(res);
}

// ---------------------------------------------------------------------------
// Sprint 53 — Documents (KYC)
// ---------------------------------------------------------------------------

export interface DocumentResponse {
  document_id: string;
  user_id: string;
  type: string;
  url: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

/** Submit a document (base64 data URL stored in url field). */
export async function submitDocument(
  token: string,
  type: string,
  url: string
): Promise<DocumentResponse> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/documents`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ type, url }),
  });
  return _json<DocumentResponse>(res);
}

/** List the current user's submitted documents. */
export async function listMyDocuments(token: string): Promise<DocumentResponse[]> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/documents`, {
    headers: _auth(token),
  });
  return _json<DocumentResponse[]>(res);
}

// ---------------------------------------------------------------------------
// In-app messaging — Sprint 66
// ---------------------------------------------------------------------------

export interface ChatMessage {
  message_id: string;
  sender_role: string;
  body: string;
  created_at: string;
  read: boolean;
  mine: boolean;
}

export async function listTripMessages(token: string, tripId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/messages`, { headers: _auth(token) });
  return _json<ChatMessage[]>(res);
}

export async function sendTripMessage(token: string, tripId: string, body: string): Promise<ChatMessage> {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/messages`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return _json<ChatMessage>(res);
}

export async function listRequestMessages(token: string, requestId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/messages`, { headers: _auth(token) });
  return _json<ChatMessage[]>(res);
}

export async function sendRequestMessage(token: string, requestId: string, body: string): Promise<ChatMessage> {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/messages`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return _json<ChatMessage>(res);
}

// ---------------------------------------------------------------------------
// Wallet — Sprint 33 (mirrors the web-customer wallet). Amounts in USD cents.
// ---------------------------------------------------------------------------

export interface Wallet {
  wallet_id: string;
  balance_cents: number;
}

export interface WalletTransaction {
  tx_id: string;
  wallet_id: string;
  tx_type: string; // credit | debit | refund
  amount_cents: number;
  reason: string;
  reference_id: string | null;
  balance_after: number;
  created_at: string;
}

export async function getWallet(token: string): Promise<Wallet> {
  const res = await fetch(`${API_BASE}/v1/wallet`, { headers: _auth(token) });
  return _json<Wallet>(res);
}

// WS2 — a top-up is now a real payment. The wallet is credited only once the
// provider confirms via webhook.
export interface WalletTopup {
  topup_id: string;
  amount_cents: number;
  currency: string;
  provider: string;
  provider_ref: string | null;
  status: string; // pending | paid | failed
  checkout_url: string | null;
}

export async function topupWallet(token: string, amountCents: number): Promise<WalletTopup> {
  const res = await fetch(`${API_BASE}/v1/wallet/topup`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ amount_cents: amountCents }),
  });
  return _json<WalletTopup>(res);
}

export async function getWalletTransactions(
  token: string,
  limit = 20,
  offset = 0,
): Promise<WalletTransaction[]> {
  const res = await fetch(
    `${API_BASE}/v1/wallet/transactions?limit=${limit}&offset=${offset}`,
    { headers: _auth(token) },
  );
  return _json<WalletTransaction[]>(res);
}

// Sprint 69 — profile, photo, bank account
export interface UserProfile {
  user_id: string;
  email: string;
  role: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  avatar_url?: string | null;
}

export interface BankAccountInfo {
  account_holder_name: string;
  bank_name?: string | null;
  routing_number: string;
  account_number_last4: string;
  account_type: string;
  country: string;
}

export async function getProfile(token: string): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/v1/profile`, { headers: _auth(token) });
  return _json<UserProfile>(res);
}

export async function updateProfile(token: string, fields: Record<string, unknown>): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/v1/profile`, {
    method: "PATCH",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return _json<UserProfile>(res);
}

export async function avatarUploadUrl(token: string, filename: string, contentType: string): Promise<{ upload_url: string; final_url: string }> {
  const res = await fetch(`${API_BASE}/v1/profile/avatar-upload-url`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content_type: contentType }),
  });
  return _json<{ upload_url: string; final_url: string }>(res);
}

export async function getBankAccount(token: string): Promise<BankAccountInfo | null> {
  const res = await fetch(`${API_BASE}/v1/profile/bank-account`, { headers: _auth(token) });
  if (res.status === 404) return null;
  return _json<BankAccountInfo>(res);
}

export async function setBankAccount(token: string, fields: Record<string, unknown>): Promise<BankAccountInfo> {
  const res = await fetch(`${API_BASE}/v1/profile/bank-account`, {
    method: "PUT",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return _json<BankAccountInfo>(res);
}
