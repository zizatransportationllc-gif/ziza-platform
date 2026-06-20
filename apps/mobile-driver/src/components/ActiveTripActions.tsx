/**
 * ActiveTripActions — context-aware action buttons for trip lifecycle.
 * Sprint 28 — Application mobile driver
 *
 * Two legs:
 *   accepted    → driver drives to the customer; confirms arrival
 *   arrived     → waiting for the customer to confirm they are in the car
 *   in_progress → driver drives to the destination; completes the ride
 */
import React from "react";
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from "react-native";

interface Props {
  status: string;
  onArrived: () => void;
  onComplete: () => void;
  loading: boolean;
}

export default function ActiveTripActions({
  status,
  onArrived,
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
      <TouchableOpacity style={[styles.button, styles.startButton]} onPress={onArrived}>
        <Text style={styles.buttonText}>📍 I've arrived at the pickup</Text>
      </TouchableOpacity>
    );
  }

  if (status === "arrived") {
    return (
      <View style={styles.waitingBanner}>
        <Text style={styles.waitingText}>
          ⏳ Waiting for the customer to confirm they are in the car…
        </Text>
      </View>
    );
  }

  if (status === "in_progress") {
    return (
      <TouchableOpacity style={[styles.button, styles.completeButton]} onPress={onComplete}>
        <Text style={styles.buttonText}>🏁 Complete Ride</Text>
      </TouchableOpacity>
    );
  }

  if (status === "completed") {
    return (
      <View style={styles.completedBanner}>
        <Text style={styles.completedText}>Trip completed ✓</Text>
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
  waitingBanner: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  waitingText: { color: "#1D4ED8", fontWeight: "600", fontSize: 14, textAlign: "center" },
  completedBanner: {
    backgroundColor: "#DCFCE7",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  completedText: { color: "#16A34A", fontWeight: "bold", fontSize: 16 },
});
