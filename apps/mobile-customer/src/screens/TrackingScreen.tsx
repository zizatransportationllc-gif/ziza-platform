/**
 * TrackingScreen — live trip tracking with driver position and ETA.
 * Sprint 41 — "Payer" button creates a real payment intent before navigating
 *             to PaymentScreen (was a hardcoded fake URL in Sprint 35).
 */
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import { useTrip } from "../hooks/useTrip";
import { useTracking } from "../hooks/useTracking";
import { confirmOnboard, reverseGeocode } from "../api";
import TrackingMap from "../components/TrackingMap";
import EtaCard from "../components/EtaCard";
import ChatPanel from "../components/ChatPanel";

type TrackingRouteProp = RouteProp<RootStackParamList, "Tracking">;
type TrackingNavProp = NativeStackNavigationProp<RootStackParamList, "Tracking">;

export default function TrackingScreen(): React.ReactElement {
  const { token } = useAuth();
  const route = useRoute<TrackingRouteProp>();
  const navigation = useNavigation<TrackingNavProp>();
  const { tripId } = route.params;

  const { trip, refresh } = useTrip(token, tripId);
  const { position } = useTracking(token, trip?.driver_id ?? null, trip?.status ?? null);
  const [boarding, setBoarding] = useState(false);
  const [driverAddr, setDriverAddr] = useState<string | null>(null);

  // Reverse-geocode the driver's live position (only when it moves ~10 m).
  const driverGeoKey = position ? `${position.lat.toFixed(4)},${position.lng.toFixed(4)}` : null;
  useEffect(() => {
    if (!token || !position) { setDriverAddr(null); return; }
    let active = true;
    reverseGeocode(token, position.lat, position.lng)
      .then((r) => { if (active && r?.name) setDriverAddr(r.name); })
      .catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, driverGeoKey]);

  const handleBoard = async () => {
    if (!trip || !token) return;
    setBoarding(true);
    try {
      await confirmOnboard(token, trip.trip_id);
      await refresh();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not confirm pickup. Please try again.");
    } finally {
      setBoarding(false);
    }
  };

  return (
    <View style={styles.container}>
      <TrackingMap
        driverPosition={position}
        originLat={trip?.origin_lat ?? 5.3545}
        originLng={trip?.origin_lng ?? -4.0083}
        destLat={trip?.dest_lat ?? 5.3600}
        destLng={trip?.dest_lng ?? -4.0100}
      />
      <View style={styles.info}>
        <Text style={styles.status}>Status: {trip?.status ?? "…"}</Text>
        {driverAddr && (trip?.status === "accepted" || trip?.status === "arrived" || trip?.status === "in_progress") && (
          <Text style={styles.driverAddr}>📍 Driver: {driverAddr}</Text>
        )}
        {trip?.verification_code && (trip.status === "accepted" || trip.status === "arrived" || trip.status === "in_progress") && (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>🔐 VERIFICATION CODE</Text>
            <Text style={styles.codeValue}>{trip.verification_code}</Text>
            <Text style={styles.codeHint}>Share this with your driver to confirm your ride.</Text>
          </View>
        )}
        {trip?.eta_minutes != null && (
          <EtaCard etaMinutes={trip.eta_minutes} />
        )}
        {/* Gate: confirm pickup to start the ride (driver → destination) */}
        {trip?.status === "arrived" && (
          <TouchableOpacity
            style={[styles.boardButton, boarding && styles.payButtonDisabled]}
            onPress={handleBoard}
            disabled={boarding}
          >
            {boarding ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.payText}>✅ I'm in the car</Text>
            )}
          </TouchableOpacity>
        )}
        {token && (trip?.status === "accepted" || trip?.status === "arrived" || trip?.status === "in_progress") && (
          <ChatPanel token={token} scope="trip" id={tripId} accent="#1D4ED8" />
        )}
        {trip?.status === "completed" && (
          <Text style={styles.autoPayNote}>
            💳 Charged automatically to your saved card.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  info: { padding: 16 },
  status: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  driverAddr: { fontSize: 13, color: "#374151", marginBottom: 8 },
  codeCard: { alignItems: "center", backgroundColor: "#EEF3FE", borderWidth: 1, borderColor: "#1D4ED8", borderStyle: "dashed", borderRadius: 10, paddingVertical: 12, marginBottom: 10 },
  codeLabel: { fontSize: 11, fontWeight: "700", color: "#1E40AF", letterSpacing: 1 },
  codeValue: { fontSize: 30, fontWeight: "800", letterSpacing: 8, color: "#111827", fontVariant: ["tabular-nums"] },
  codeHint: { fontSize: 12, color: "#6B7280" },
  payButton: {
    backgroundColor: "#16A34A",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 12,
  },
  payButtonDisabled: { opacity: 0.6 },
  payText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  autoPayNote: { textAlign: "center", color: "#6B7280", fontSize: 14, marginTop: 16, paddingHorizontal: 16 },
  boardButton: {
    backgroundColor: "#1D4ED8",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginTop: 12,
  },
});
