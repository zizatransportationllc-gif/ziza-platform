/**
 * ProfileScreen — driver profile and logout.
 * Sprint 28 — Application mobile driver
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { logout, clearToken } from "../api";

interface Props {
  token: string;
  onLogout: () => void;
}

export default function ProfileScreen({ token, onLogout }: Props): React.ReactElement {
  const handleLogout = async () => {
    try {
      await logout(token);
    } catch {
      await clearToken();
    }
    onLogout();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Mon profil</Text>
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Se déconnecter</Text>
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
