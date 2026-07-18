/**
 * EtaCard — displays driver ETA in minutes.
 * Sprint 27 — Application mobile customer
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  etaMinutes: number;
}

export default function EtaCard({ etaMinutes }: Props): React.ReactElement {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>Arrivée estimée</Text>
      <Text style={styles.eta}>{etaMinutes} min</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#EEF3FE",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginVertical: 8,
  },
  label: { fontSize: 13, color: "#6B7280" },
  eta: { fontSize: 28, fontWeight: "bold", color: "#1D4ED8", fontVariant: ["tabular-nums"] },
});
