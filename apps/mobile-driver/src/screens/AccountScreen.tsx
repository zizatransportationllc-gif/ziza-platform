/**
 * AccountScreen — secondary items grouped under one tab (Sprint 65).
 * Rendered as the "Account" pane; pushes the existing detail screens.
 * The Documents row carries a badge while the account is pending KYC.
 */
import React from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

export default function AccountScreen(): React.ReactElement {
  const navigation = useNavigation<NavProp>();
  const { driverStatus } = useAuth();
  const needsDocs = driverStatus === "pending_docs";

  const ROWS: { key: keyof RootStackParamList; icon: string; label: string; badge?: boolean }[] = [
    { key: "Profile", icon: "👤", label: "Profile" },
    { key: "Vehicle", icon: "🚗", label: "Vehicle" },
    { key: "Documents", icon: "📄", label: "Documents", badge: needsDocs },
    { key: "Location", icon: "📍", label: "Location" },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.menu}>
        {ROWS.map((row) => (
          <TouchableOpacity
            key={row.key}
            style={styles.row}
            onPress={() => navigation.navigate(row.key as never)}
          >
            <Text style={styles.rowIcon}>{row.icon}</Text>
            <Text style={styles.rowLabel}>{row.label}</Text>
            {row.badge && <View style={styles.badge}><Text style={styles.badgeText}>!</Text></View>}
            <Text style={styles.rowChevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16 },
  menu: { gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowIcon: { fontSize: 20 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111827" },
  rowChevron: { fontSize: 18, color: "#9CA3AF" },
  badge: {
    backgroundColor: "#EF4444",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
