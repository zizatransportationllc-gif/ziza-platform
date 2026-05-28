/**
 * ProfileScreen — user profile and logout.
 * Sprint 35
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../context/AuthContext";

export default function ProfileScreen(): React.ReactElement {
  const { logout } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>My Profile</Text>
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  logoutButton: {
    backgroundColor: "#EF4444",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
