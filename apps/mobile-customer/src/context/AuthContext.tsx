/**
 * AuthContext — shared auth state for mobile-customer.
 * Provides token, login(), logout() to all screens via context
 * so React Navigation doesn't need to pass props manually.
 */
import React, { createContext, useContext, useState, useEffect } from "react";
import {
  getStoredToken,
  storeToken,
  clearToken,
  logout as apiLogout,
} from "../api";

interface AuthContextType {
  token: string | null;
  ready: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getStoredToken()
      .then(setToken)
      .finally(() => setReady(true));
  }, []);

  const login = async (newToken: string) => {
    await storeToken(newToken);
    setToken(newToken);
  };

  const logout = async () => {
    try {
      if (token) await apiLogout(token);
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
