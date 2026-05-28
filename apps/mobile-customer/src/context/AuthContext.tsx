/**
 * AuthContext — shared auth state for mobile-customer.
 * Sprint 39 — adds Expo push token registration on login.
 */
import React, { createContext, useContext, useState, useEffect } from "react";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import {
  getStoredToken,
  storeToken,
  clearToken,
  logout as apiLogout,
  registerDeviceToken,
  deregisterDeviceToken,
} from "../api";

interface AuthContextType {
  token: string | null;
  ready: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
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

  useEffect(() => {
    getStoredToken()
      .then(async (t) => {
        setToken(t);
        // Re-register push token on cold start (token may have rotated)
        if (t) await _registerPush(t);
      })
      .finally(() => setReady(true));
  }, []);

  const login = async (newToken: string) => {
    await storeToken(newToken);
    setToken(newToken);
    await _registerPush(newToken);
  };

  const logout = async () => {
    try {
      if (token) {
        await _deregisterPush(token);
        await apiLogout(token);
      }
    } catch {
      await clearToken();
    }
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
