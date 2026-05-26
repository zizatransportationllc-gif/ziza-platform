/**
 * Ziza Mobile Customer — Sprint 27
 * React Native 0.74 + Expo SDK 51 + TypeScript
 */
import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { getStoredToken } from "./src/api";
import { useNotifications } from "./src/hooks/useNotifications";
import AppNavigator from "./src/navigation/AppNavigator";

export default function App(): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getStoredToken()
      .then(setToken)
      .finally(() => setReady(true));
  }, []);

  // Register push notification device token
  useNotifications(token);

  if (!ready) return <></>;

  return (
    <>
      <AppNavigator isAuthenticated={!!token} />
      <StatusBar style="auto" />
    </>
  );
}
