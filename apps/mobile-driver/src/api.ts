/**
 * API client for mobile-driver — Sprint 40.
 * Isolated per frontend-isolation rule (no shared code with other frontends).
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

export interface DriverProfile {
  driver_id: string;
  user_id: string;
  status: string;
  is_online: boolean;
  registered_at: string;
}

// Mirrors the backend TripResponse (app/main.py). Fares are USD cents.
export interface TripResponse {
  trip_id: string;
  status: string;
  fare_cents: number | null;
  distance_km: number | null;
  duration_min: number | null;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  category: string;
  created_at: string;
}


export interface LocationResponse {
  driver_id: string;
  lat: number;
  lng: number;
  updated_at: string;
}

export interface EarningsResponse {
  total_cents: number;
  total_trips: number;
  today_cents: number;
  today_trips: number;
  week_cents: number;
  week_trips: number;
}

export interface DocumentResponse {
  document_id: string;
  type: string;
  url: string;
  status: string;
  note_admin?: string | null;
  created_at: string;
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

export interface RatingResponse {
  average_stars: number | null;
  total_ratings: number;
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

/** Sprint 64 — create a new driver account. */
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
      role: "driver",
    }),
  });
  const data = await _json<TokenResponse>(res);
  await storeTokenPair(data.access_token, data.refresh_token);
  return data;
}

/** Sprint 66 — exchange a Firebase ID token for a Ziza JWT (role: driver). */
export async function exchangeFirebaseToken(
  idToken: string,
  opts: { firstName?: string; lastName?: string; birthDate?: string; phone?: string | null } = {}
): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/v1/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_token: idToken,
      role: "driver",
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

// ---------------------------------------------------------------------------
// Driver profile
// ---------------------------------------------------------------------------

export async function registerDriver(token: string): Promise<DriverProfile> {
  const res = await fetch(`${API_BASE}/v1/drivers/register`, {
    method: "POST",
    headers: _auth(token),
  });
  return _json<DriverProfile>(res);
}

export async function getDriverProfile(token: string): Promise<DriverProfile> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/profile`, {
    headers: _auth(token),
  });
  return _json<DriverProfile>(res);
}

export async function setDriverOnline(
  token: string,
  online: boolean
): Promise<{ driver_id: string; is_online: boolean }> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/online`, {
    method: "PUT",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ online }),
  });
  return _json<{ driver_id: string; is_online: boolean }>(res);
}

export async function getMyRating(token: string): Promise<RatingResponse> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/rating`, {
    headers: _auth(token),
  });
  return _json<RatingResponse>(res);
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export async function updateDriverLocation(
  token: string,
  lat: number,
  lng: number
): Promise<LocationResponse> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/location`, {
    method: "PUT",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });
  return _json<LocationResponse>(res);
}

export async function getDriverLocation(
  token: string
): Promise<LocationResponse | null> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/location`, {
    headers: _auth(token),
  });
  if (res.status === 404) return null;
  return _json<LocationResponse>(res);
}

// ---------------------------------------------------------------------------
// Trips — dispatch
// ---------------------------------------------------------------------------

export async function listAvailableTrips(token: string): Promise<TripResponse[]> {
  const res = await fetch(`${API_BASE}/v1/trips/driver/available`, {
    headers: _auth(token),
  });
  return _json<TripResponse[]>(res);
}

export async function acceptTrip(
  token: string,
  tripId: string
): Promise<TripResponse> {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/accept`, {
    method: "PATCH",
    headers: _auth(token),
  });
  return _json<TripResponse>(res);
}

export async function startTrip(
  token: string,
  tripId: string
): Promise<TripResponse> {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/start`, {
    method: "PATCH",
    headers: _auth(token),
  });
  return _json<TripResponse>(res);
}

export async function completeTrip(
  token: string,
  tripId: string
): Promise<TripResponse> {
  const res = await fetch(`${API_BASE}/v1/trips/${tripId}/complete`, {
    method: "PATCH",
    headers: _auth(token),
  });
  return _json<TripResponse>(res);
}

export async function getActiveTrip(
  token: string
): Promise<{ trip: TripResponse | null }> {
  const res = await fetch(`${API_BASE}/v1/trips/driver/active`, {
    headers: _auth(token),
  });
  return _json<{ trip: TripResponse | null }>(res);
}

export async function listDriverTripHistory(
  token: string,
  limit = 20,
  offset = 0
): Promise<TripResponse[]> {
  const res = await fetch(
    `${API_BASE}/v1/trips/driver/history?limit=${limit}&offset=${offset}`,
    { headers: _auth(token) }
  );
  return _json<TripResponse[]>(res);
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export async function getMyEarnings(token: string): Promise<EarningsResponse> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/earnings`, {
    headers: _auth(token),
  });
  return _json<EarningsResponse>(res);
}

// ---------------------------------------------------------------------------
// Documents (KYC)
// ---------------------------------------------------------------------------

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

export async function listMyDocuments(token: string): Promise<DocumentResponse[]> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/documents`, {
    headers: _auth(token),
  });
  return _json<DocumentResponse[]>(res);
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
// Vehicle — Sprint 62
// ---------------------------------------------------------------------------

export interface VehicleResponse {
  vehicle_id: string;
  plate: string;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  category: string;
}

export async function getMyVehicle(token: string): Promise<VehicleResponse | null> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/vehicle`, {
    headers: _auth(token),
  });
  if (res.status === 404) return null;
  return _json<VehicleResponse>(res);
}

export async function registerVehicle(
  token: string,
  plate: string,
  make: string | null,
  model: string | null,
  year: number | null,
  color: string | null,
  category: string = "economy"
): Promise<VehicleResponse> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/vehicle`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ plate, make, model, year, color, category }),
  });
  return _json<VehicleResponse>(res);
}

// ---------------------------------------------------------------------------
// Navigation utilities
// ---------------------------------------------------------------------------

/**
 * Builds a Google Maps deep link URL for turn-by-turn navigation.
 * Falls back to the web URL (universally works on all platforms).
 */
export function buildNavigationUrl(destLat: number, destLng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`;
}

/**
 * Haversine distance between two GPS coordinates (in km).
 * Used to sort dispatch trips by proximity.
 */
export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// In-app messaging — Sprint 66 (driver ↔ customer)
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

// ---------------------------------------------------------------------------
// Withdrawals (payouts) — Sprint 67. Capped at available balance server-side.
// ---------------------------------------------------------------------------

export interface DriverBalance {
  driver_id: string;
  gains_bruts_cents: number;
  commission_cents: number;
  retraits_cents: number;
  solde_net_cents: number;
  disponible_cents: number;
}

export interface PayoutRecord {
  payout_id: string;
  driver_id: string;
  amount_cents: number;
  status: string;
  note_admin: string | null;
  created_at: string;
  updated_at: string;
}

export async function getDriverBalance(token: string): Promise<DriverBalance> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/balance`, { headers: _auth(token) });
  return _json<DriverBalance>(res);
}

export async function createPayout(token: string, amountXof: number): Promise<PayoutRecord> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/payout-requests`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ amount_cents: amountXof }),
  });
  return _json<PayoutRecord>(res);
}

export async function listPayouts(token: string): Promise<PayoutRecord[]> {
  const res = await fetch(`${API_BASE}/v1/drivers/me/payout-requests`, { headers: _auth(token) });
  return _json<PayoutRecord[]>(res);
}

// WS3 — Stripe Connect payout onboarding
export interface ConnectStatus {
  account_id: string | null;
  onboarded: boolean;
  payouts_enabled: boolean;
}

export async function getConnectStatus(token: string): Promise<ConnectStatus> {
  const res = await fetch(`${API_BASE}/v1/payouts/connect/status`, { headers: _auth(token) });
  return _json<ConnectStatus>(res);
}

export async function connectOnboard(token: string): Promise<{ account_id: string; onboarding_url: string }> {
  const res = await fetch(`${API_BASE}/v1/payouts/connect/onboard`, { method: "POST", headers: _auth(token) });
  return _json<{ account_id: string; onboarding_url: string }>(res);
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
