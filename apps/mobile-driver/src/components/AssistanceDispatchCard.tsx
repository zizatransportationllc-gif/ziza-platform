/**
 * AssistanceDispatchCard — shows an assistance request with type icon and accept button.
 * Sprint 28 — Application mobile driver
 */
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { AssistanceResponse } from "../api";

interface Props {
  request: AssistanceResponse;
  onAccept: () => void;
  disabled: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  flat_tire: "🛞",
  breakdown: "🔧",
  accident: "🚨",
  tow: "🚛",
  fuel: "⛽",
  lockout: "🔑",
  other: "🆘",
};

export default function AssistanceDispatchCard({
  request,
  onAccept,
  disabled,
}: Props): React.ReactElement {
  const icon = TYPE_ICONS[request.type] ?? "🆘";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.type}>{request.type.replace(/_/g, " ").toUpperCase()}</Text>
        <Text style={styles.urgentBadge}>ASSISTANCE</Text>
      </View>
      <Text style={styles.location}>
        📍 {request.latitude.toFixed(4)}, {request.longitude.toFixed(4)}
      </Text>
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
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#F97316",
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  icon: { fontSize: 20 },
  type: { fontWeight: "bold", fontSize: 14, color: "#C2410C", flex: 1 },
  urgentBadge: {
    backgroundColor: "#F97316",
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  location: { fontSize: 13, color: "#6B7280", marginBottom: 10 },
  acceptButton: {
    backgroundColor: "#F97316",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  acceptText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
});
