/**
 * Ziza Mobile Driver — Sprint 37
 * AuthContext wraps the entire app so all screens access token/isOnline
 * via useAuth() instead of props (fixes "undefined is not a function" crash).
 */
import React from "react";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import AppNavigator from "./src/navigation/AppNavigator";
import LoginScreen from "./src/screens/LoginScreen";

// Must be imported at module level to register the background task before
// any component mounts (Expo requirement for expo-task-manager).
import "./src/background/LocationTask";

function AppInner(): React.ReactElement {
  const { token, ready } = useAuth();

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
