/**
 * MainScreen — tab host for the driver app (Sprint 65, 4-tab navigation).
 *
 * A custom bottom tab bar switches between Dispatch, Earnings, Activity and
 * Account, mirroring the web-driver layout. Detail screens (ActiveTrip,
 * Profile, Vehicle, Documents, Location, Notifications) are pushed on top via
 * the parent stack. The notification bell lives in the header.
 */
import React, { useEffect, useLayoutEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RootStackParamList } from "../navigation/AppNavigator";
import { listNotifications } from "../api";
import { useAuth } from "../context/AuthContext";
import DispatchScreen from "./DispatchScreen";
import EarningsScreen from "./EarningsScreen";
import HistoryScreen from "./HistoryScreen";
import AccountScreen from "./AccountScreen";
import Icon from "../components/Icon";

type NavProp = NativeStackNavigationProp<RootStackParamList, "Main">;
type Tab = "dispatch" | "earnings" | "activity" | "account";

const TABS: { key: Tab; icon: string; label: string; title: string }[] = [
  { key: "dispatch", icon: "dispatch", label: "Dispatch", title: "Missions" },
  { key: "earnings", icon: "earnings", label: "Earnings", title: "Earnings" },
  { key: "activity", icon: "activity", label: "Activity", title: "Activity" },
  { key: "account", icon: "account", label: "Account", title: "Account" },
];

const ACCENT = "#1D4ED8";

export default function MainScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("dispatch");
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    if (!token) return;
    listNotifications(token)
      .then((items) => setUnread(items.filter((n) => !n.read).length))
      .catch(() => {});
  }, [token]);

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
          <Icon name="bell" size={20} color="#fff" />
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
        {tab === "dispatch" && <DispatchScreen />}
        {tab === "earnings" && <EarningsScreen />}
        {tab === "activity" && <HistoryScreen />}
        {tab === "account" && <AccountScreen />}
      </View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((t) => {
          const isActive = t.key === tab;
          return (
            <TouchableOpacity key={t.key} style={styles.tabItem} onPress={() => setTab(t.key)}>
              <Icon name={t.icon} size={22} color={isActive ? ACCENT : "#9CA3AF"} />
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
  tabLabelActive: { color: ACCENT },
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
