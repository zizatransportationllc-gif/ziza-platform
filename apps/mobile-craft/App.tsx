/**
 * App entry — Ziza Craft (mobile-craft).
 * Sprint 47 — professional marketplace for technical interventions.
 */
import React from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { useNotifications } from "./src/hooks/useNotifications";
import AppNavigator from "./src/navigation/AppNavigator";

// Must be set at module level (outside any component): show banner + play sound
// + vibrate even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function RootNavigator(): React.ReactElement {
  const { ready, token } = useAuth();
  useNotifications(token);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return <AppNavigator isAuthenticated={!!token} />;
}

export default function App(): React.ReactElement {
  return (
    <AuthProvider>
      <StatusBar style="light" backgroundColor="#059669" />
      <RootNavigator />
    </AuthProvider>
  );
}
