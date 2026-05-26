/**
 * ActiveTripScreen — accept → start → complete lifecycle + navigation deep link.
 * Sprint 28 — Application mobile driver
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
import ActiveTripActions from "../components/ActiveTripActions";
import { startTrip, completeTrip, buildNavigationUrl, TripResponse } from "../api";

interface Props {
  token: string;
  trip: TripResponse | null;
}

type ActiveTripRouteProp = RouteProp<RootStackParamList, "ActiveTrip">;

export default function ActiveTripScreen({ token, trip }: Props): React.ReactElement {
  const route = useRoute<ActiveTripRouteProp>();
  const { tripId } = route.params;
  const [currentTrip, setCurrentTrip] = useState<TripResponse | null>(trip);
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      const updated = await startTrip(token, tripId);
      setCurrentTrip(updated);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const updated = await completeTrip(token, tripId);
      setCurrentTrip(updated);
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = () => {
    if (!currentTrip) return;
    const url = buildNavigationUrl(currentTrip.dest_lat, currentTrip.dest_lng);
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) return Linking.openURL(url);
        const fallback = buildNavigationUrl(
          currentTrip.dest_lat,
          currentTrip.dest_lng
        );
        return Linking.openURL(fallback);
      })
      .catch(() => {});
  };

  const status = currentTrip?.status ?? "accepted";

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Mission #{tripId.slice(0, 8)}</Text>
      <Text style={styles.status}>Statut : {status}</Text>
      {currentTrip && (
        <Text style={styles.price}>{currentTrip.price_xof} XOF</Text>
      )}

      <TouchableOpacity style={styles.navButton} onPress={handleNavigate}>
        <Text style={styles.navText}>🗺 Naviguer vers la destination</Text>
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
