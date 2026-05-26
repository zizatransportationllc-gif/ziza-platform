/**
 * LocationScreen — toggle GPS sharing and show current position.
 * Sprint 28 — Application mobile driver
 */
import React, { useState, useEffect } from "react";
import { View, Text, Switch, StyleSheet, ActivityIndicator } from "react-native";
import { useBackgroundLocation } from "../hooks/useBackgroundLocation";
import { getDriverLocation, LocationResponse } from "../api";

interface Props {
  token: string;
  isOnline: boolean;
}

export default function LocationScreen({ token, isOnline }: Props): React.ReactElement {
  const [location, setLocation] = useState<LocationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useBackgroundLocation(token, isOnline);

  useEffect(() => {
    getDriverLocation(token)
      .then(setLocation)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Partage de position</Text>
      <View style={styles.row}>
        <Text style={styles.label}>
          {isOnline ? "🟢 Position active" : "⚫ Position désactivée"}
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator color="#1D4ED8" />
      ) : location ? (
        <View style={styles.coords}>
          <Text style={styles.coordText}>Latitude : {location.lat.toFixed(6)}</Text>
          <Text style={styles.coordText}>Longitude : {location.lng.toFixed(6)}</Text>
          <Text style={styles.updated}>
            Mis à jour : {new Date(location.updated_at).toLocaleTimeString("fr-FR")}
          </Text>
        </View>
      ) : (
        <Text style={styles.empty}>Position non encore envoyée.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  label: { fontSize: 16, fontWeight: "600" },
  coords: {
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    padding: 16,
    gap: 4,
  },
  coordText: { fontSize: 15, color: "#1E3A5F" },
  updated: { fontSize: 13, color: "#6B7280", marginTop: 8 },
  empty: { color: "#9CA3AF", textAlign: "center", marginTop: 24 },
});
