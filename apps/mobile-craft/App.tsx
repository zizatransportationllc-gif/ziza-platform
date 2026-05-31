/**
 * App entry — Ziza Craft (mobile-craft).
 * Sprint 47 — professional marketplace for technical interventions.
 */
import React from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import AppNavigator from "./src/navigation/AppNavigator";

function RootNavigator(): React.ReactElement {
  const { ready, token } = useAuth();

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
