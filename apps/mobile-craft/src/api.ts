/**
 * API client for mobile-craft — Sprint 47 (Ziza Craft).
 * Isolated per frontend-isolation rule (no shared code with other frontends).
 *
 * Color theme: Emerald #059669
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE =
  (process.env.EXPO_PUBLIC_API_URL as string) || "http://localhost:8000";

const TOKEN_KEY = "ziza_craft_access_token";
const REFRESH_TOKEN_KEY = "ziza_craft_refresh_token";

// ---------------------------------------------------------------------------
// Error type
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

export interface ProfessionalProfile {
  professional_id: string;
  user_id: string;
  specialties: string;
  bio: string | null;
  status: string;
  is_online: boolean;
  current_lat: number | null;
  current_lng: number | null;
  created_at: string;
}

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

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

export async function storeTokenPair(
  accessToken: string,
  refreshToken: string | null | undefined
): Promise<void> {
  const pairs: [string, string][] = [[TOKEN_KEY, accessToken]];
  if (refreshToken) pairs.push([REFRESH_TOKEN_KEY, refreshToken]);
  await AsyncStorage.multiSet(pairs);
}

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

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

/** Sprint 64 — create a new professional account. */
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
      role: "professional",
    }),
  });
  const data = await _json<TokenResponse>(res);
  await storeTokenPair(data.access_token, data.refresh_token);
  return data;
}

/** Sprint 66 — exchange a Firebase ID token for a Ziza JWT (role: professional). */
export async function exchangeFirebaseToken(
  idToken: string,
  opts: { firstName?: string; lastName?: string; birthDate?: string; phone?: string | null } = {}
): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/v1/auth/firebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_token: idToken,
      role: "professional",
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
  await storeTokenPair(data.access_token, data.refresh_token);
  return data;
}

// ---------------------------------------------------------------------------
// Professional profile
// ---------------------------------------------------------------------------

export async function registerProfessional(
  token: string,
  specialties: string = "",
  bio: string | null = null
): Promise<ProfessionalProfile> {
  const res = await fetch(`${API_BASE}/v1/craft/professionals/register`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ specialties, bio }),
  });
  return _json<ProfessionalProfile>(res);
}

export async function getMyProfessionalProfile(
  token: string
): Promise<ProfessionalProfile> {
  const res = await fetch(`${API_BASE}/v1/craft/professionals/me`, {
    headers: _auth(token),
  });
  return _json<ProfessionalProfile>(res);
}

export async function updateProfessionalProfile(
  token: string,
  updates: {
    specialties?: string;
    bio?: string | null;
    is_online?: boolean;
    current_lat?: number | null;
    current_lng?: number | null;
  }
): Promise<ProfessionalProfile> {
  const res = await fetch(`${API_BASE}/v1/craft/professionals/me`, {
    method: "PATCH",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return _json<ProfessionalProfile>(res);
}

// ---------------------------------------------------------------------------
// Craft requests (professional view)
// ---------------------------------------------------------------------------

export async function listOpenCraftRequests(
  token: string,
  lat: number,
  lng: number,
  limit = 20,
  offset = 0
): Promise<CraftRequest[]> {
  const res = await fetch(
    `${API_BASE}/v1/craft/requests?lat=${lat}&lng=${lng}&limit=${limit}&offset=${offset}`,
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

// ---------------------------------------------------------------------------
// Bids
// ---------------------------------------------------------------------------

export async function submitBid(
  token: string,
  requestId: string,
  bid: {
    price_cents: number;
    eta_min: number;
    note?: string | null;
    professional_lat?: number | null;
    professional_lng?: number | null;
  }
): Promise<CraftBid> {
  const res = await fetch(`${API_BASE}/v1/craft/requests/${requestId}/bids`, {
    method: "POST",
    headers: { ..._auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(bid),
  });
  return _json<CraftBid>(res);
}

export async function getMyBids(
  token: string,
  limit = 20,
  offset = 0
): Promise<CraftBid[]> {
  const res = await fetch(
    `${API_BASE}/v1/craft/bids/mine?limit=${limit}&offset=${offset}`,
    { headers: _auth(token) }
  );
  return _json<CraftBid[]>(res);
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
// Sprint 53 — Documents (KYC)
// ---------------------------------------------------------------------------

export interface DocumentResponse {
  document_id: string;
  user_id?: string;
  type: string;
  url: string;
  status: string;
  note_admin?: string | null;
  created_at: string;
  updated_at?: string;
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
// Utilities
// ---------------------------------------------------------------------------

export function formatUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

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
