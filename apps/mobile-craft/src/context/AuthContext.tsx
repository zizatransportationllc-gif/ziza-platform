/**
 * AuthContext — auth + professional-profile state for mobile-craft.
 * Sprint 47 — Ziza Craft.
 *
 * Cold-start flow:
 *   1. Read stored access token.
 *   2. Validate via getMyProfessionalProfile() — catches expired tokens (401).
 *   3. On 401: attempt silent refresh with stored refresh token.
 *   4. Network errors treated as transient — keep session alive offline.
 */
import React, { createContext, useContext, useState, useEffect } from "react";

import {
  getStoredToken,
  storeTokenPair,
  getStoredRefreshToken,
  clearTokenPair,
  logout as apiLogout,
  refreshAccessToken,
  getMyProfessionalProfile,
  ProfessionalProfile,
  ApiError,
} from "../api";

interface AuthContextType {
  token: string | null;
  ready: boolean;
  profile: ProfessionalProfile | null;
  login: (accessToken: string, refreshToken?: string | null) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<ProfessionalProfile | null>(null);

  const _loadProfile = async (t: string): Promise<ProfessionalProfile | null> => {
    try {
      return await getMyProfessionalProfile(t);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const storedAccess = await getStoredToken();
        if (!storedAccess) return;

        let activeToken = storedAccess;

        try {
          const p = await getMyProfessionalProfile(storedAccess);
          setProfile(p);
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            const storedRefresh = await getStoredRefreshToken();
            if (!storedRefresh) {
              await clearTokenPair();
              return;
            }
            try {
              const newPair = await refreshAccessToken(storedRefresh);
              activeToken = newPair.access_token;
              const p = await getMyProfessionalProfile(activeToken);
              setProfile(p);
            } catch {
              await clearTokenPair();
              return;
            }
          }
          // Network / server error — keep token alive
        }

        setToken(activeToken);
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
    const p = await _loadProfile(accessToken);
    setProfile(p);
  };

  const logout = async () => {
    if (token) {
      await apiLogout(token).catch(() => clearTokenPair());
    } else {
      await clearTokenPair();
    }
    setToken(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (!token) return;
    const p = await _loadProfile(token);
    setProfile(p);
  };

  return (
    <AuthContext.Provider value={{ token, ready, profile, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
