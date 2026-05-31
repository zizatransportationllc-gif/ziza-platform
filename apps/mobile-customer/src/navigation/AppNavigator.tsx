/**
 * AppNavigator — React Navigation stack for mobile-customer.
 * Sprint 47 — added Craft screens.
 */
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LoginScreen from "../screens/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import TrackingScreen from "../screens/TrackingScreen";
import PaymentScreen from "../screens/PaymentScreen";
import HistoryScreen from "../screens/HistoryScreen";
import PlacesScreen from "../screens/PlacesScreen";
import ProfileScreen from "../screens/ProfileScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import CraftRequestScreen from "../screens/CraftRequestScreen";
import MyCraftRequestsScreen from "../screens/MyCraftRequestsScreen";
import BidsScreen from "../screens/BidsScreen";

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Tracking: { tripId: string };
  Payment: { tripId: string; checkoutUrl: string };
  History: undefined;
  Places: { onSelect: (place: { lat: number; lng: number; name: string }) => void };
  Profile: undefined;
  Notifications: undefined;
  CraftRequest: undefined;
  MyCraftRequests: undefined;
  Bids: { requestId: string; customerLat?: number; customerLng?: number };
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
        screenOptions={{ headerStyle: { backgroundColor: "#F97316" }, headerTintColor: "#fff" }}
      >
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: "Ziza — Book a Ride" }} />
            <Stack.Screen name="Tracking" component={TrackingScreen} options={{ title: "Live Tracking" }} />
            <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: "Payment" }} />
            <Stack.Screen name="History" component={HistoryScreen} options={{ title: "My Trips" }} />
            <Stack.Screen name="Places" component={PlacesScreen} options={{ title: "Search Location" }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Notifications" }} />
            <Stack.Screen
              name="CraftRequest"
              component={CraftRequestScreen}
              options={{ title: "Request a Professional" }}
            />
            <Stack.Screen
              name="MyCraftRequests"
              component={MyCraftRequestsScreen}
              options={{ title: "My Craft Requests" }}
            />
            <Stack.Screen
              name="Bids"
              component={BidsScreen}
              options={{ title: "Received Bids" }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
