/**
 * MainScreen — tab host for the pro (craft) app (Sprint 65, 4-tab navigation).
 *
 * A custom bottom tab bar switches between Requests, Earnings, My Bids and
 * Account, mirroring the web-craft layout. Detail screens (RequestDetail,
 * Profile, Documents) are pushed on top via the parent stack.
 */
import React, { useLayoutEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RootStackParamList } from "../navigation/AppNavigator";
import HomeScreen from "./HomeScreen";
import WithdrawalsScreen from "./WithdrawalsScreen";
import MyBidsScreen from "./MyBidsScreen";
import AccountScreen from "./AccountScreen";
import Icon from "../components/Icon";

type NavProp = NativeStackNavigationProp<RootStackParamList, "Main">;
type Tab = "requests" | "earnings" | "bids" | "account";

const TABS: { key: Tab; icon: string; label: string; title: string }[] = [
  { key: "requests", icon: "requests", label: "Requests", title: "Nearby Requests" },
  { key: "earnings", icon: "earnings", label: "Earnings", title: "Earnings" },
  { key: "bids", icon: "bids", label: "My Bids", title: "My Bids" },
  { key: "account", icon: "account", label: "Account", title: "Account" },
];

const ACCENT = "#1D4ED8";

export default function MainScreen(): React.ReactElement {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("requests");

  const active = TABS.find((t) => t.key === tab)!;

  useLayoutEffect(() => {
    navigation.setOptions({ title: active.title });
  }, [navigation, active.title]);

  return (
    <View style={styles.root}>
      <View style={styles.pane}>
        {tab === "requests" && <HomeScreen />}
        {tab === "earnings" && <WithdrawalsScreen />}
        {tab === "bids" && <MyBidsScreen />}
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
});
