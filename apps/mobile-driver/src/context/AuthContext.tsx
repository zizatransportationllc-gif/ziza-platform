/**
 * AuthContext — shared auth + online-status for mobile-driver.
 * Sprint 37 — fix prop-drilling crash identical to mobile-customer Sprint 35 fix.
 *
 * Provides token, isOnline, login(), logout(), setOnline() to all screens
 * so React Navigation never needs to pass custom props manually.
 */
import React, { createContext, useContext, useState, useEffect } from "react";
import {
  getStoredToken,
  storeToken,
  clearToken,
  logout as apiLogout,
  getDriverProfile,
  setDriverOnline,
} from "../api";

interface AuthContextType {
  token: string | null;
  ready: boolean;
  isOnline: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  setOnline: (online: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  // Restore session on mount
  useEffect(() => {
    getStoredToken()
      .then(async (t) => {
        setToken(t);
        if (t) {
          try {
            const profile = await getDriverProfile(t);
            setIsOnline(profile.is_online);
          } catch {
            // Profile fetch failed — start offline; user can re-toggle
          }
        }
      })
      .finally(() => setReady(true));
  }, []);

  const login = async (newToken: string) => {
    await storeToken(newToken);
    setToken(newToken);
    try {
      const profile = await getDriverProfile(newToken);
      setIsOnline(profile.is_online);
    } catch {
      setIsOnline(false);
    }
  };

  const logout = async () => {
    try {
      if (token) await apiLogout(token);
    } catch {
      await clearToken();
    }
    setToken(null);
    setIsOnline(false);
  };

  const setOnline = async (online: boolean) => {
    if (!token) return;
    try {
      await setDriverOnline(token, online);
      setIsOnline(online);
    } catch {
      // API error — keep current state; DispatchScreen shows error via useDispatch
    }
  };

  return (
    <AuthContext.Provider value={{ token, ready, isOnline, login, logout, setOnline }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
