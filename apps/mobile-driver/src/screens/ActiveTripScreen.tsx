/**
 * ActiveTripScreen — accept → start → complete lifecycle + navigation deep link.
 * Sprint 37 — uses useAuth() instead of props.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from "react-native";
import { useRoute, RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import ActiveTripActions from "../components/ActiveTripActions";
import { startTrip, completeTrip, buildNavigationUrl, TripResponse } from "../api";

type ActiveTripRouteProp = RouteProp<RootStackParamList, "ActiveTrip">;

function formatUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((n ?? 0) / 100);
}

export default function ActiveTripScreen(): React.ReactElement {
  const { token } = useAuth();
  const route = useRoute<ActiveTripRouteProp>();
  const { tripId } = route.params;
  const [currentTrip, setCurrentTrip] = useState<TripResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const updated = await startTrip(token, tripId);
      setCurrentTrip(updated);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const updated = await completeTrip(token, tripId);
      setCurrentTrip(updated);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = () => {
    if (!currentTrip) return;
    const url = buildNavigationUrl(currentTrip.dest_lat, currentTrip.dest_lng);
    Linking.openURL(url).catch(() => {});
  };

  const status = currentTrip?.status ?? "accepted";

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Trip #{tripId.slice(0, 8)}</Text>
      <Text style={styles.status}>Status: {status}</Text>
      {currentTrip && (
        <Text style={styles.price}>{formatUSD(currentTrip.price_xof)}</Text>
      )}

      <TouchableOpacity style={styles.navButton} onPress={handleNavigate}>
        <Text style={styles.navText}>🗺 Navigate to destination</Text>
      </TouchableOpacity>

      <ActiveTripActions
        status={status}
        onStart={handleStart}
        onComplete={handleComplete}
        loading={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  status: { fontSize: 16, color: "#374151", marginBottom: 4 },
  price: { fontSize: 24, fontWeight: "bold", color: "#1D4ED8", marginBottom: 20 },
  navButton: {
    backgroundColor: "#DBEAFE",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  navText: { color: "#1D4ED8", fontWeight: "600", fontSize: 15 },
});
