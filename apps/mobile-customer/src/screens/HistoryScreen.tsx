/**
 * HistoryScreen — customer trip history list.
 * Sprint 42 — Pay Now for unpaid completed trips.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { listTripHistory, createPaymentIntent, TripResponse } from "../api";
import { useAuth } from "../context/AuthContext";
import TripCard from "../components/TripCard";

type HistoryNavProp = NativeStackNavigationProp<RootStackParamList, "History">;

export default function HistoryScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation<HistoryNavProp>();
  const [trips, setTrips] = useState<TripResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listTripHistory(token)
      .then(setTrips)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  async function handlePay(trip: TripResponse) {
    if (!token) return;
    setPayingId(trip.trip_id);
    try {
      const intent = await createPaymentIntent(token, trip.trip_id);
      navigation.navigate("Payment", {
        tripId: trip.trip_id,
        checkoutUrl: intent.checkout_url,
      });
    } catch (e: any) {
      Alert.alert("Payment Error", e.message || "Could not initialize payment.");
    } finally {
      setPayingId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>My Trips</Text>
      <FlatList
        data={trips}
        keyExtractor={(item) => item.trip_id}
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            onPay={
              item.status === "completed" && !item.paid_at
                ? () => handlePay(item)
                : undefined
            }
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No trips yet.</Text>
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
