/**
 * HistoryScreen — customer trip history list.
 * Sprint 27 — Application mobile customer
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { listTripHistory, TripResponse } from "../api";
import TripCard from "../components/TripCard";

interface Props {
  token: string;
}

export default function HistoryScreen({ token }: Props): React.ReactElement {
  const [trips, setTrips] = useState<TripResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTripHistory(token)
      .then(setTrips)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Mes trajets</Text>
      <FlatList
        data={trips}
        keyExtractor={(item) => item.trip_id}
        renderItem={({ item }) => <TripCard trip={item} />}
        ListEmptyComponent={
          <Text style={styles.empty}>Aucun trajet pour l'instant.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 12 },
  empty: { color: "#9CA3AF", textAlign: "center", marginTop: 24 },
});
