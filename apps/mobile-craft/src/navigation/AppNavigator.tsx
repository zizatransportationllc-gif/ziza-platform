/**
 * AppNavigator — React Navigation stack for mobile-craft.
 * Sprint 53 — added Documents screen.
 */
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LoginScreen from "../screens/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import RequestDetailScreen from "../screens/RequestDetailScreen";
import MyBidsScreen from "../screens/MyBidsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import DocumentsScreen from "../screens/DocumentsScreen";

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  RequestDetail: { requestId: string };
  MyBids: undefined;
  Profile: undefined;
  Documents: undefined;
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
        screenOptions={{
          headerStyle: { backgroundColor: "#059669" },
          headerTintColor: "#fff",
        }}
      >
        {isAuthenticated ? (
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: "Ziza Craft — Nearby Requests" }}
            />
            <Stack.Screen
              name="RequestDetail"
              component={RequestDetailScreen}
              options={{ title: "Request Detail" }}
            />
            <Stack.Screen
              name="MyBids"
              component={MyBidsScreen}
              options={{ title: "My Bids" }}
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ title: "Professional Profile" }}
            />
            <Stack.Screen
              name="Documents"
              component={DocumentsScreen}
              options={{ title: "My Documents" }}
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
