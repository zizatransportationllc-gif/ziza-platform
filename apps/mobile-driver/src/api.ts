/**
 * API client for mobile-driver — Sprint 28.
 * Isolated per frontend-isolation rule (no shared code with other frontends).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE =
  (process.env.EXPO_PUBLIC_API_URL as string) || "http://localhost:8000";

const TOKEN_KEY = "ziza_access_token";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function _json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function _auth(token: string): HeadersInit {
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

export interface TripResponse {
  trip_id: string;
  status: string;
  customer_id: string;
  driver_id: string | null;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  price_xof: number;
  category_id: string;
  eta_minutes: number | null;
  created_at: string;
}

export interface AssistanceResponse {
  request_id: string;
  type: string;
  status: string;
  driver_id: string | null;
  latitude: number;
  longitude: number;
  created_at: string;
}

export interface LocationResponse {
  driver_id: string;
  lat: number;
  lng: number;
  updated_at: string;
}

export interface EarningsResponse {
  total_xof: number;
  total_trips: number;
  today_xof: number;
  today_trips: number;
  week_xof: number;
  week_trips: number;
}

export interface DocumentResponse {
  document_id: string;
  type: string;
  url: string;
  status: string;
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
  await storeToken(data.access_token);
  return data;
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API_BASE}/v1/auth/logout`, {
    method: "POST",
    headers: _auth(token),
  }).catch(() => {});
  await clearToken();
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
  await storeToken(data.access_token);
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
    headers: { ...(_auth(token) as object), "Content-Type": "application/json" },
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
    headers: { ...(_auth(token) as object), "Content-Type": "application/json" },
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
// Assistance — dispatch
// ---------------------------------------------------------------------------

export async function listAvailableAssistance(
  token: string
): Promise<AssistanceResponse[]> {
  const res = await fetch(`${API_BASE}/v1/assistance/driver/available`, {
    headers: _auth(token),
  });
  return _json<AssistanceResponse[]>(res);
}

export async function acceptAssistance(
  token: string,
  requestId: string
): Promise<AssistanceResponse> {
  const res = await fetch(`${API_BASE}/v1/assistance/${requestId}/accept`, {
    method: "PATCH",
    headers: _auth(token),
  });
  return _json<AssistanceResponse>(res);
}

export async function startAssistance(
  token: string,
  requestId: string
): Promise<AssistanceResponse> {
  const res = await fetch(`${API_BASE}/v1/assistance/${requestId}/start`, {
    method: "PATCH",
    headers: _auth(token),
  });
  return _json<AssistanceResponse>(res);
}

export async function resolveAssistance(
  token: string,
  requestId: string
): Promise<AssistanceResponse> {
  const res = await fetch(`${API_BASE}/v1/assistance/${requestId}/resolve`, {
    method: "PATCH",
    headers: _auth(token),
  });
  return _json<AssistanceResponse>(res);
}

export async function getActiveAssistance(
  token: string
): Promise<{ request: AssistanceResponse | null }> {
  const res = await fetch(`${API_BASE}/v1/assistance/driver/active`, {
    headers: _auth(token),
  });
  return _json<{ request: AssistanceResponse | null }>(res);
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
    headers: { ...(_auth(token) as object), "Content-Type": "application/json" },
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
    headers: { ...(_auth(token) as object), "Content-Type": "application/json" },
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
