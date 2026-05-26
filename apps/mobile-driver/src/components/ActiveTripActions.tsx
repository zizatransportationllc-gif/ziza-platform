/**
 * ActiveTripActions — context-aware action buttons for trip lifecycle.
 * Sprint 28 — Application mobile driver
 */
import React from "react";
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from "react-native";

interface Props {
  status: string;
  onStart: () => void;
  onComplete: () => void;
  loading: boolean;
}

export default function ActiveTripActions({
  status,
  onStart,
  onComplete,
  loading,
}: Props): React.ReactElement | null {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1D4ED8" />
      </View>
    );
  }

  if (status === "accepted") {
    return (
      <TouchableOpacity style={[styles.button, styles.startButton]} onPress={onStart}>
        <Text style={styles.buttonText}>🚗 Démarrer la mission</Text>
      </TouchableOpacity>
    );
  }

  if (status === "in_progress") {
    return (
      <TouchableOpacity style={[styles.button, styles.completeButton]} onPress={onComplete}>
        <Text style={styles.buttonText}>✅ Terminer la mission</Text>
      </TouchableOpacity>
    );
  }

  if (status === "completed") {
    return (
      <View style={styles.completedBanner}>
        <Text style={styles.completedText}>Mission terminée ✓</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  center: { padding: 20, alignItems: "center" },
  button: {
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  startButton: { backgroundColor: "#1D4ED8" },
  completeButton: { backgroundColor: "#16A34A" },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  completedBanner: {
    backgroundColor: "#DCFCE7",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  completedText: { color: "#16A34A", fontWeight: "bold", fontSize: 16 },
});
