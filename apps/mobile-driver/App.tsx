/**
 * Ziza Mobile Driver — Sprint 28
 * React Native 0.74 + Expo SDK 51 + TypeScript
 * Background location + dispatch polling + FCM push
 */
import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { getStoredToken } from "./src/api";
import AppNavigator from "./src/navigation/AppNavigator";
import LoginScreen from "./src/screens/LoginScreen";

// Must be imported at module level to register the background task before
// any component mounts (Expo requirement for expo-task-manager).
import "./src/background/LocationTask";

export default function App(): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getStoredToken()
      .then(setToken)
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <></>;

  if (!token) {
    return <LoginScreen onLoginSuccess={(t) => setToken(t)} />;
  }

  return (
    <>
      <AppNavigator />
      <StatusBar style="auto" />
    </>
  );
}
