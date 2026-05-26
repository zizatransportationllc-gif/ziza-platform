/**
 * TripCard — displays a single trip summary row.
 * Sprint 27 — Application mobile customer
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TripResponse } from "../api";

interface Props {
  trip: TripResponse;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  accepted: "#3B82F6",
  in_progress: "#8B5CF6",
  completed: "#16A34A",
  cancelled: "#EF4444",
};

export default function TripCard({ trip }: Props): React.ReactElement {
  const color = STATUS_COLORS[trip.status] ?? "#6B7280";
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.price}>{trip.price_xof} XOF</Text>
        <Text style={[styles.status, { color }]}>{trip.status}</Text>
      </View>
      <Text style={styles.date}>{new Date(trip.created_at).toLocaleDateString("fr-FR")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  price: { fontWeight: "bold", fontSize: 16 },
  status: { fontWeight: "600", fontSize: 14 },
  date: { color: "#9CA3AF", fontSize: 13 },
});
