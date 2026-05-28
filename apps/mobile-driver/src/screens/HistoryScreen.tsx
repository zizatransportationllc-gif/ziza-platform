/**
 * HistoryScreen — driver trip history.
 * Sprint 37 — uses useAuth() instead of props.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { listDriverTripHistory, TripResponse } from "../api";

export default function HistoryScreen(): React.ReactElement {
  const { token } = useAuth();
  const [trips, setTrips] = useState<TripResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    listDriverTripHistory(token)
      .then(setTrips)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Historique des trajets</Text>
      <FlatList
        data={trips}
        keyExtractor={(item) => item.trip_id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.date}>
              {new Date(item.created_at).toLocaleDateString("fr-FR")}
            </Text>
            <Text style={styles.price}>{item.price_xof} XOF</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Aucun trajet effectué.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 12 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  date: { color: "#374151", fontSize: 15 },
  price: { fontWeight: "bold", color: "#1D4ED8", fontSize: 15 },
  empty: { color: "#9CA3AF", textAlign: "center", marginTop: 32 },
});
