/**
 * AppNavigator — React Navigation stack for mobile-craft.
 * Sprint 65 — 4-tab navigation: MainScreen hosts the Requests / Earnings /
 * My Bids / Account tabs; the screens below are pushed on top as details.
 */
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LoginScreen from "../screens/LoginScreen";
import MainScreen from "../screens/MainScreen";
import HomeScreen from "../screens/HomeScreen";
import RequestDetailScreen from "../screens/RequestDetailScreen";
import MyBidsScreen from "../screens/MyBidsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import DocumentsScreen from "../screens/DocumentsScreen";
import WithdrawalsScreen from "../screens/WithdrawalsScreen";
import AccountScreen from "../screens/AccountScreen";

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Home: undefined;
  RequestDetail: { requestId: string; canManage?: boolean };
  MyBids: undefined;
  Profile: undefined;
  Documents: undefined;
  Withdrawals: undefined;
  Account: undefined;
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
              name="Main"
              component={MainScreen}
              options={{ title: "Ziza Craft" }}
            />
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: "Ziza Craft — Nearby Requests" }}
            />
            <Stack.Screen
              name="Account"
              component={AccountScreen}
              options={{ title: "Account" }}
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
            <Stack.Screen
              name="Withdrawals"
              component={WithdrawalsScreen}
              options={{ title: "Withdrawals" }}
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
