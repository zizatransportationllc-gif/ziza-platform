/**
 * AuthContext — shared auth + online-status for mobile-driver.
 * Sprint 40 — auto token refresh on cold start (silent re-auth).
 *
 * Cold-start flow:
 *   1. Read stored access token.
 *   2. Validate via getDriverProfile() — catches expired tokens (401).
 *   3. On 401: attempt silent refresh with stored refresh token.
 *      • Success → swap in new pair, continue as normal.
 *      • Failure (revoked / expired) → clear storage, show Login.
 *   4. Network errors are treated as transient — keep session alive offline.
 */
import React, { createContext, useContext, useState, useEffect } from "react";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import {
  getStoredToken,
  storeTokenPair,
  getStoredRefreshToken,
  clearTokenPair,
  logout as apiLogout,
  refreshAccessToken,
  getDriverProfile,
  setDriverOnline,
  registerDeviceToken,
  deregisterDeviceToken,
  ApiError,
} from "../api";

interface AuthContextType {
  token: string | null;
  ready: boolean;
  isOnline: boolean;
  driverStatus: string;  // Sprint 54: "active" | "pending_docs" | "inactive" | "suspended"
  login: (accessToken: string, refreshToken?: string | null) => Promise<void>;
  logout: () => Promise<void>;
  setOnline: (online: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ---------------------------------------------------------------------------
// Push token helpers
// ---------------------------------------------------------------------------

async function _getExpoPushToken(): Promise<string | null> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenData.data;
  } catch {
    return null;
  }
}

async function _registerPush(authToken: string): Promise<void> {
  const pushToken = await _getExpoPushToken();
  if (pushToken) {
    await registerDeviceToken(authToken, pushToken, "android").catch(() => {});
  }
}

async function _deregisterPush(authToken: string): Promise<void> {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    await deregisterDeviceToken(authToken, tokenData.data).catch(() => {});
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [driverStatus, setDriverStatus] = useState<string>("pending_docs"); // Sprint 54 — safe default: lock until profile confirmed

  useEffect(() => {
    (async () => {
      try {
        const storedAccess = await getStoredToken();
        if (!storedAccess) return; // no token stored → show Login

        let activeToken = storedAccess;

        // --- Validate token + load online status + driver status ---
        try {
          const profile = await getDriverProfile(storedAccess);
          setIsOnline(profile.is_online);
          setDriverStatus(profile.status || "pending_docs"); // Sprint 54
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            // Access token expired — attempt silent refresh
            const storedRefresh = await getStoredRefreshToken();
            if (!storedRefresh) {
              await clearTokenPair();
              return; // no refresh token → show Login
            }
            try {
              const newPair = await refreshAccessToken(storedRefresh);
              activeToken = newPair.access_token;
              const profile = await getDriverProfile(activeToken);
              setIsOnline(profile.is_online);
              setDriverStatus(profile.status || "pending_docs"); // Sprint 54
            } catch {
              // Refresh token revoked or expired → force re-login
              await clearTokenPair();
              return;
            }
          }
          // Network / server error → treat as transient, keep token alive
        }

        setToken(activeToken);
        await _registerPush(activeToken);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = async (
    accessToken: string,
    refreshToken?: string | null
  ) => {
    await storeTokenPair(accessToken, refreshToken);
    setToken(accessToken);
    try {
      const profile = await getDriverProfile(accessToken);
      setIsOnline(profile.is_online);
      setDriverStatus(profile.status || "pending_docs"); // Sprint 54
    } catch {
      setIsOnline(false);
    }
    await _registerPush(accessToken);
  };

  const logout = async () => {
    if (token) {
      await _deregisterPush(token).catch(() => {});
      await apiLogout(token).catch(() => clearTokenPair());
    } else {
      await clearTokenPair();
    }
    setToken(null);
    setIsOnline(false);
    setDriverStatus("pending_docs"); // reset to safe default on logout
  };

  const setOnline = async (online: boolean) => {
    if (!token) return;
    if (driverStatus === "pending_docs") return; // Sprint 58: locked until docs approved
    try {
      await setDriverOnline(token, online);
      setIsOnline(online);
    } catch {
      // API error — keep current state
    }
  };

  return (
    <AuthContext.Provider value={{ token, ready, isOnline, driverStatus, login, logout, setOnline }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
