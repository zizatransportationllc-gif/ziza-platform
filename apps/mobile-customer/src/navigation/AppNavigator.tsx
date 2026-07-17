/**
 * AppNavigator — React Navigation stack for mobile-customer.
 * Sprint 65 — 4-tab navigation: MainScreen hosts the Ride / Assistance /
 * Activity / Account tabs; the screens below are pushed on top as details.
 */
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LoginScreen from "../screens/LoginScreen";
import MainScreen from "../screens/MainScreen";
import TrackingScreen from "../screens/TrackingScreen";
import PaymentScreen from "../screens/PaymentScreen";
import HistoryScreen from "../screens/HistoryScreen";
import PlacesScreen from "../screens/PlacesScreen";
import ProfileScreen from "../screens/ProfileScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import CraftRequestScreen from "../screens/CraftRequestScreen";
import MyCraftRequestsScreen from "../screens/MyCraftRequestsScreen";
import BidsScreen from "../screens/BidsScreen";
import DocumentsScreen from "../screens/DocumentsScreen";
import PaymentMethodsScreen from "../screens/PaymentMethodsScreen";
import SavedPlacesScreen from "../screens/SavedPlacesScreen";

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
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
  Documents: undefined;
  PaymentMethods: undefined;
  SavedPlaces: undefined;
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
            <Stack.Screen name="Main" component={MainScreen} options={{ title: "Ziza" }} />
            <Stack.Screen name="Tracking" component={TrackingScreen} options={{ title: "Live Tracking" }} />
            <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: "Payment" }} />
            <Stack.Screen name="History" component={HistoryScreen} options={{ title: "My Trips" }} />
            <Stack.Screen name="Places" component={PlacesScreen} options={{ title: "Search Location" }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Notifications" }} />
            <Stack.Screen
              name="CraftRequest"
              component={CraftRequestScreen}
              options={{ title: "Request Assistance" }}
            />
            <Stack.Screen
              name="MyCraftRequests"
              component={MyCraftRequestsScreen}
              options={{ title: "My Assistance Requests" }}
            />
            <Stack.Screen
              name="Bids"
              component={BidsScreen}
              options={{ title: "Received Bids" }}
            />
            <Stack.Screen
              name="Documents"
              component={DocumentsScreen}
              options={{ title: "My Documents" }}
            />
            <Stack.Screen
              name="PaymentMethods"
              component={PaymentMethodsScreen}
              options={{ title: "Payment Methods" }}
            />
            <Stack.Screen
              name="SavedPlaces"
              component={SavedPlacesScreen}
              options={{ title: "My Places" }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
