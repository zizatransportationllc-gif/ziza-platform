/**
 * ProfileScreen — user profile and logout.
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

      <TouchableOpacity
        style={styles.docsButton}
        onPress={() => navigation.navigate("Documents")}
      >
        <Text style={styles.docsText}>📄 My Documents</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
  docsButton: {
    backgroundColor: "#F97316",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  docsText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  logoutButton: {
    backgroundColor: "#EF4444",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
