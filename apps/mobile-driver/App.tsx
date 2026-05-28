/**
 * Ziza Mobile Driver — Sprint 39
 * Push notifications wired up: setNotificationHandler at module level,
 * token registration in AuthContext, listeners in useNotifications.
 */
import React from "react";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { useNotifications } from "./src/hooks/useNotifications";
import AppNavigator from "./src/navigation/AppNavigator";
import LoginScreen from "./src/screens/LoginScreen";

// Must be imported at module level — registers background location task
import "./src/background/LocationTask";

// Show alerts when a notification arrives while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function AppInner(): React.ReactElement {
  const { token, ready } = useAuth();
  useNotifications(token);

  if (!ready) return <></>;
  if (!token) return <LoginScreen />;

  return (
    <>
      <AppNavigator />
      <StatusBar style="light" />
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
