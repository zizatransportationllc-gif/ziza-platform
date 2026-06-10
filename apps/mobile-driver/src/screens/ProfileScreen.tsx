/**
 * ProfileScreen — driver profile and logout.
 * Sprint 53 — added Documents link.
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/AppNavigator";

type ProfileNav = NativeStackNavigationProp<RootStackParamList, "Profile">;

export default function ProfileScreen(): React.ReactElement {
  const { logout } = useAuth();
  const navigation = useNavigation<ProfileNav>();

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>My Profile</Text>

      {/* Sprint 62 — Vehicle tile */}
      <TouchableOpacity
        style={styles.tileButton}
        onPress={() => navigation.navigate("Vehicle")}
      >
        <Text style={styles.tileIcon}>🚗</Text>
        <View style={styles.tileBody}>
          <Text style={styles.tileTitle}>My Vehicle</Text>
          <Text style={styles.tileSub}>Registration, make, model &amp; category</Text>
        </View>
        <Text style={styles.tileChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tileButton}
        onPress={() => navigation.navigate("Documents")}
      >
        <Text style={styles.tileIcon}>📄</Text>
        <View style={styles.tileBody}>
          <Text style={styles.tileTitle}>My Documents</Text>
          <Text style={styles.tileSub}>KYC verification documents</Text>
        </View>
        <Text style={styles.tileChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 20 },
  heading: { fontSize: 22, fontWeight: "bold", color: "#111827", marginBottom: 20 },

  tileButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  tileIcon: { fontSize: 26, marginRight: 14 },
  tileBody: { flex: 1 },
  tileTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  tileSub: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  tileChevron: { fontSize: 22, color: "#9CA3AF" },

  logoutButton: {
    backgroundColor: "#EF4444",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  logoutText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
