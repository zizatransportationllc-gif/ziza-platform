/**
 * MainScreen — tab host for the customer app (Sprint 65, 4-tab navigation).
 *
 * A custom bottom tab bar switches between four panes — Ride, Assistance,
 * Activity, Account — mirroring the web-customer layout. Detail screens
 * (Tracking, Payment, Bids, Places, Notifications…) are still pushed on top
 * via the parent stack. The notification bell lives in the header.
 */
import React, { useEffect, useLayoutEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RootStackParamList } from "../navigation/AppNavigator";
import { listNotifications } from "../api";
import { useAuth } from "../context/AuthContext";
import HomeScreen from "./HomeScreen";
import MyCraftRequestsScreen from "./MyCraftRequestsScreen";
import ActivityScreen from "./ActivityScreen";
import AccountScreen from "./AccountScreen";

type NavProp = NativeStackNavigationProp<RootStackParamList, "Main">;
type Tab = "course" | "assistance" | "activity" | "account";

const TABS: { key: Tab; icon: string; label: string; title: string }[] = [
  { key: "course", icon: "🚕", label: "Ride", title: "Book a Ride" },
  { key: "assistance", icon: "🔧", label: "Assistance", title: "Assistance" },
  { key: "activity", icon: "📋", label: "Activity", title: "Activity" },
  { key: "account", icon: "👤", label: "Account", title: "Account" },
];

export default function MainScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("course");
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    if (!token) return;
    listNotifications(token)
      .then((items) => setUnread(items.filter((n) => !n.read).length))
      .catch(() => {});
  }, [token]);

  // Refresh the bell badge on mount and whenever the host regains focus
  // (e.g. after returning from the Notifications screen).
  useEffect(() => {
    refreshUnread();
    const unsub = navigation.addListener("focus", refreshUnread);
    return unsub;
  }, [navigation, refreshUnread]);

  const active = TABS.find((t) => t.key === tab)!;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: active.title,
      headerRight: () => (
        <TouchableOpacity
          style={styles.bell}
          onPress={() => navigation.navigate("Notifications")}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.bellIcon}>🔔</Text>
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, active.title, unread]);

  return (
    <View style={styles.root}>
      <View style={styles.pane}>
        {tab === "course" && <HomeScreen />}
        {tab === "assistance" && <MyCraftRequestsScreen />}
        {tab === "activity" && <ActivityScreen />}
        {tab === "account" && <AccountScreen />}
      </View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.tabItem}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>{t.icon}</Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  pane: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#fff",
    paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  tabIcon: { fontSize: 20, opacity: 0.5 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 11, color: "#9CA3AF", fontWeight: "600" },
  tabLabelActive: { color: "#F97316" },
  bell: { paddingHorizontal: 8, paddingVertical: 4 },
  bellIcon: { fontSize: 20 },
  badge: {
    position: "absolute",
    top: 0,
    right: 2,
    backgroundColor: "#EF4444",
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
});
