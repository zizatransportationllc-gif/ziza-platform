/**
 * TrackingScreen — live trip tracking with driver position and ETA.
 * Sprint 35
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import { useTrip } from "../hooks/useTrip";
import { useTracking } from "../hooks/useTracking";
import TrackingMap from "../components/TrackingMap";
import EtaCard from "../components/EtaCard";

type TrackingRouteProp = RouteProp<RootStackParamList, "Tracking">;
type TrackingNavProp = NativeStackNavigationProp<RootStackParamList, "Tracking">;

export default function TrackingScreen(): React.ReactElement {
  const { token } = useAuth();
  const route = useRoute<TrackingRouteProp>();
  const navigation = useNavigation<TrackingNavProp>();
  const { tripId } = route.params;

  const { trip } = useTrip(token, tripId);
  const { position } = useTracking(token, trip?.driver_id ?? null, trip?.status ?? null);

  const handlePay = () => {
    if (!trip) return;
    navigation.navigate("Payment", {
      tripId: trip.trip_id,
      checkoutUrl: `https://pay.ziza.dev/checkout/${trip.trip_id}`,
    });
  };

  return (
    <View style={styles.container}>
      <TrackingMap
        driverPosition={position}
        originLat={trip?.origin_lat ?? 40.7357}
        originLng={trip?.origin_lng ?? -74.1724}
        destLat={trip?.dest_lat ?? 40.7282}
        destLng={trip?.dest_lng ?? -74.0776}
      />
      <View style={styles.info}>
        <Text style={styles.status}>Status: {trip?.status ?? "…"}</Text>
        {trip?.eta_minutes != null && (
          <EtaCard etaMinutes={trip.eta_minutes} />
        )}
        {trip?.status === "completed" && (
          <TouchableOpacity style={styles.payButton} onPress={handlePay}>
            <Text style={styles.payText}>Proceed to Payment</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  info: { padding: 16 },
  status: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  payButton: {
    backgroundColor: "#16A34A",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
  },
  payText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
