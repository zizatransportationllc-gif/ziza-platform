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
import { useBackgroundLocation } from "./src/hooks/useBackgroundLocation";
import AppNavigator from "./src/navigation/AppNavigator";
import LoginScreen from "./src/screens/LoginScreen";

// Must be imported at module level — registers background location task
import "./src/background/LocationTask";

// Show alerts when a notification arrives while the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // SDK 54 — shouldShowAlert split into shouldShowBanner + shouldShowList
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function AppInner(): React.ReactElement {
  const { token, ready, isOnline } = useAuth();
  useNotifications(token);
  // Share GPS continuously while online, regardless of the current screen, so
  // the customer can track the driver in real time during a trip.
  useBackgroundLocation(token, isOnline);

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
