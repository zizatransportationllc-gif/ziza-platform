/**
 * TripDispatchCard — shows a trip card with distance, category badge, and accept button.
 * Sprint 28 — Application mobile driver
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { TripResponse } from "../api";

interface Props {
  trip: TripResponse;
  onAccept: () => void;
  disabled: boolean;
  driverLat?: number;
  driverLng?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  economy: "#6B7280",
  comfort: "#1D4ED8",
  premium: "#7C3AED",
};

export default function TripDispatchCard({
  trip,
  onAccept,
  disabled,
}: Props): React.ReactElement {
  const badgeColor = CATEGORY_COLORS[trip.category_id] ?? "#6B7280";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.badge, { backgroundColor: badgeColor }]}>
          {trip.category_id.toUpperCase()}
        </Text>
        <Text style={styles.price}>{trip.price_cents} XOF</Text>
      </View>
      <Text style={styles.route}>
        ({trip.origin_lat.toFixed(3)}, {trip.origin_lng.toFixed(3)}) →{" "}
        ({trip.dest_lat.toFixed(3)}, {trip.dest_lng.toFixed(3)})
      </Text>
      {trip.eta_minutes != null && (
        <Text style={styles.eta}>ETA client : {trip.eta_minutes} min</Text>
      )}
      <TouchableOpacity
        style={[styles.acceptButton, disabled && styles.disabled]}
        onPress={onAccept}
        disabled={disabled}
      >
        <Text style={styles.acceptText}>Accepter</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  badge: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  price: { fontWeight: "bold", fontSize: 16, color: "#111827" },
  route: { fontSize: 13, color: "#6B7280", marginBottom: 6 },
  eta: { fontSize: 13, color: "#059669", marginBottom: 10 },
  acceptButton: {
    backgroundColor: "#16A34A",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  acceptText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
});
