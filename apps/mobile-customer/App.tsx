/**
 * Ziza Mobile Customer — Sprint 39
 * React Native + Expo SDK — push notifications wired up.
 *
 * setNotificationHandler MUST be called at module level (outside any component)
 * so Expo registers the handler before the first notification arrives.
 */
import React from "react";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { StripeProvider } from "@stripe/stripe-react-native";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { useNotifications } from "./src/hooks/useNotifications";
import AppNavigator from "./src/navigation/AppNavigator";
import LoginScreen from "./src/screens/LoginScreen";

// Show alerts + play sound when a notification arrives while the app is open
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
  const { token, ready } = useAuth();
  useNotifications(token);

  if (!ready) return <></>;
  if (!token) return <LoginScreen />;

  return (
    <>
      <AppNavigator isAuthenticated={!!token} />
      <StatusBar style="auto" />
    </>
  );
}

const STRIPE_PK = (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY as string) || "";

export default function App(): React.ReactElement {
  return (
    <StripeProvider publishableKey={STRIPE_PK}>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </StripeProvider>
  );
}
