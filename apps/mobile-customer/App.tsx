/**
 * Ziza Mobile Customer — Sprint 35
 * React Native 0.74 + Expo SDK 51 + TypeScript
 */
import React from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { useNotifications } from "./src/hooks/useNotifications";
import AppNavigator from "./src/navigation/AppNavigator";

function AppInner(): React.ReactElement {
  const { token, ready } = useAuth();
  useNotifications(token);
  if (!ready) return <></>;
  return (
    <>
      <AppNavigator isAuthenticated={!!token} />
      <StatusBar style="auto" />
    </>
  );
}

export default function App(): React.ReactElement {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
