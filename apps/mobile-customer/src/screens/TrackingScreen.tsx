/**
 * TrackingScreen — live trip tracking with driver position and ETA.
 * Sprint 41 — "Payer" button creates a real payment intent before navigating
 *             to PaymentScreen (was a hardcoded fake URL in Sprint 35).
 */
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import { useTrip } from "../hooks/useTrip";
import { useTracking } from "../hooks/useTracking";
import { createPaymentIntent } from "../api";
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

  const { trip } = useTrip(token, tripId);
  const { position } = useTracking(token, trip?.driver_id ?? null, trip?.status ?? null);
  const [payLoading, setPayLoading] = useState(false);

  const handlePay = async () => {
    if (!trip || !token) return;
    setPayLoading(true);
    try {
      // Create (or retrieve existing) payment intent from the API
      const intent = await createPaymentIntent(token, trip.trip_id);
      navigation.navigate("Payment", {
        tripId: trip.trip_id,
        checkoutUrl: intent.checkout_url,
      });
    } catch (e: any) {
      Alert.alert(
        "Payment Error",
        e.message || "Could not initialize payment. Please try again.",
      );
    } finally {
      setPayLoading(false);
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
        {trip?.verification_code && (trip.status === "accepted" || trip.status === "in_progress") && (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>🔐 VERIFICATION CODE</Text>
            <Text style={styles.codeValue}>{trip.verification_code}</Text>
            <Text style={styles.codeHint}>Share this with your driver to confirm your ride.</Text>
          </View>
        )}
        {trip?.eta_minutes != null && (
          <EtaCard etaMinutes={trip.eta_minutes} />
        )}
        {token && (trip?.status === "accepted" || trip?.status === "in_progress") && (
          <ChatPanel token={token} scope="trip" id={tripId} accent="#F97316" />
        )}
        {trip?.status === "completed" && (
          <TouchableOpacity
            style={[styles.payButton, payLoading && styles.payButtonDisabled]}
            onPress={handlePay}
            disabled={payLoading}
          >
            {payLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.payText}>💳 Proceed to Payment</Text>
            )}
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
  codeCard: { alignItems: "center", backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#F97316", borderStyle: "dashed", borderRadius: 10, paddingVertical: 12, marginBottom: 10 },
  codeLabel: { fontSize: 11, fontWeight: "700", color: "#9A3412", letterSpacing: 1 },
  codeValue: { fontSize: 30, fontWeight: "800", letterSpacing: 8, color: "#111827" },
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
});
