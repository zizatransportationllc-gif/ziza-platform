/**
 * AppNavigator — React Navigation stack for mobile-customer.
 * Sprint 27 — Application mobile customer
 */
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LoginScreen from "../screens/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import TrackingScreen from "../screens/TrackingScreen";
import PaymentScreen from "../screens/PaymentScreen";
import HistoryScreen from "../screens/HistoryScreen";
import AssistanceScreen from "../screens/AssistanceScreen";
import PlacesScreen from "../screens/PlacesScreen";
import ProfileScreen from "../screens/ProfileScreen";
import NotificationsScreen from "../screens/NotificationsScreen";

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Tracking: { tripId: string };
  Payment: { tripId: string; checkoutUrl: string };
  History: undefined;
  Assistance: undefined;
  Places: { onSelect: (place: { lat: number; lng: number; name: string }) => void };
  Profile: undefined;
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

interface AppNavigatorProps {
  isAuthenticated: boolean;
}

export default function AppNavigator({
  isAuthenticated,
}: AppNavigatorProps): React.ReactElement {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerStyle: { backgroundColor: "#F97316" } }}
      >
        {isAuthenticated ? (
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: "Ziza — Réserver un trajet" }}
            />
            <Stack.Screen
              name="Tracking"
              component={TrackingScreen}
              options={{ title: "Suivi en temps réel" }}
            />
            <Stack.Screen
              name="Payment"
              component={PaymentScreen}
              options={{ title: "Paiement" }}
            />
            <Stack.Screen
              name="History"
              component={HistoryScreen}
              options={{ title: "Mes trajets" }}
            />
            <Stack.Screen
              name="Assistance"
              component={AssistanceScreen}
              options={{ title: "Assistance" }}
            />
            <Stack.Screen
              name="Places"
              component={PlacesScreen}
              options={{ title: "Choisir un lieu" }}
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ title: "Profil" }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ title: "Notifications" }}
            />
          </>
        ) : (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
