/**
 * AppNavigator — React Navigation stack for mobile-driver.
 * Sprint 28 — Application mobile driver
 */
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import DispatchScreen from "../screens/DispatchScreen";
import ActiveTripScreen from "../screens/ActiveTripScreen";
import LocationScreen from "../screens/LocationScreen";
import EarningsScreen from "../screens/EarningsScreen";
import HistoryScreen from "../screens/HistoryScreen";
import DocumentsScreen from "../screens/DocumentsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import NotificationsScreen from "../screens/NotificationsScreen";

export type RootStackParamList = {
  Dispatch: undefined;
  ActiveTrip: { tripId: string };
  Location: undefined;
  Earnings: undefined;
  History: undefined;
  Documents: undefined;
  Profile: undefined;
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator(): React.ReactElement {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerStyle: { backgroundColor: "#1D4ED8" } }}
      >
        <Stack.Screen
          name="Dispatch"
          component={DispatchScreen}
          options={{ title: "Ziza Driver — Missions" }}
        />
        <Stack.Screen
          name="ActiveTrip"
          component={ActiveTripScreen}
          options={{ title: "Mission en cours" }}
        />
        <Stack.Screen
          name="Location"
          component={LocationScreen}
          options={{ title: "Ma position" }}
        />
        <Stack.Screen
          name="Earnings"
          component={EarningsScreen}
          options={{ title: "Mes gains" }}
        />
        <Stack.Screen
          name="History"
          component={HistoryScreen}
          options={{ title: "Historique" }}
        />
        <Stack.Screen
          name="Documents"
          component={DocumentsScreen}
          options={{ title: "Documents KYC" }}
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
