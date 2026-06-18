/**
 * ActiveTripScreen — shows the accepted trip's pickup/destination (map +
 * readable addresses), then drives the start → complete lifecycle.
 * The trip is loaded on mount so the driver immediately sees where to go.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import * as Location from "expo-location";
import { useRoute, RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import ActiveTripActions from "../components/ActiveTripActions";
import ChatPanel from "../components/ChatPanel";
import TripMap from "../components/TripMap";
import { startTrip, completeTrip, getActiveTrip, buildNavigationUrl, TripResponse } from "../api";

type ActiveTripRouteProp = RouteProp<RootStackParamList, "ActiveTrip">;

function formatUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((n ?? 0) / 100);
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const a = results?.[0];
    if (!a) return null;
    return [a.name, a.street, a.city, a.region].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
}

export default function ActiveTripScreen(): React.ReactElement {
  const { token } = useAuth();
  const route = useRoute<ActiveTripRouteProp>();
  const { tripId } = route.params;
  const [currentTrip, setCurrentTrip] = useState<TripResponse | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pickupAddr, setPickupAddr] = useState<string | null>(null);
  const [destAddr, setDestAddr] = useState<string | null>(null);

  // Load the active trip on mount so the driver gets the info right away.
  const loadTrip = useCallback(async () => {
    if (!token) return;
    try {
      const { trip } = await getActiveTrip(token);
      if (trip) setCurrentTrip(trip);
    } catch {
      /* keep whatever we have */
    } finally {
      setLoadingTrip(false);
    }
  }, [token]);

  useEffect(() => { loadTrip(); }, [loadTrip]);

  // Reverse-geocode pickup + destination to readable addresses.
  useEffect(() => {
    if (!currentTrip) return;
    let active = true;
    reverseGeocode(currentTrip.origin_lat, currentTrip.origin_lng).then((a) => { if (active) setPickupAddr(a); });
    reverseGeocode(currentTrip.dest_lat, currentTrip.dest_lng).then((a) => { if (active) setDestAddr(a); });
    return () => { active = false; };
  }, [currentTrip?.origin_lat, currentTrip?.origin_lng, currentTrip?.dest_lat, currentTrip?.dest_lng]);

  const handleStart = async () => {
    if (!token) return;
    setLoading(true);
    try {
      setCurrentTrip(await startTrip(token, tripId));
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
      setCurrentTrip(await completeTrip(token, tripId));
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const status = currentTrip?.status ?? "accepted";

  // Navigate to the pickup while heading there, to the destination once started.
  const handleNavigate = () => {
    if (!currentTrip) return;
    const toDest = status === "in_progress";
    const lat = toDest ? currentTrip.dest_lat : currentTrip.origin_lat;
    const lng = toDest ? currentTrip.dest_lng : currentTrip.origin_lng;
    Linking.openURL(buildNavigationUrl(lat, lng)).catch(() => {});
  };

  if (loadingTrip && !currentTrip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.heading}>Trip #{tripId.slice(0, 8)}</Text>
      <Text style={styles.status}>Status: {status}</Text>
      {currentTrip && <Text style={styles.price}>{formatUSD(currentTrip.fare_cents)}</Text>}

      {currentTrip && (
        <>
          <View style={styles.mapWrap}>
            <TripMap
              originLat={currentTrip.origin_lat}
              originLng={currentTrip.origin_lng}
              destLat={currentTrip.dest_lat}
              destLng={currentTrip.dest_lng}
            />
          </View>

          <View style={styles.locRow}>
            <Text style={styles.locIcon}>📍</Text>
            <View style={styles.locText}>
              <Text style={styles.locLabel}>PICKUP</Text>
              <Text style={styles.locAddr}>
                {pickupAddr ?? `${currentTrip.origin_lat.toFixed(5)}, ${currentTrip.origin_lng.toFixed(5)}`}
              </Text>
            </View>
          </View>
          <View style={styles.locRow}>
            <Text style={styles.locIcon}>🏁</Text>
            <View style={styles.locText}>
              <Text style={styles.locLabel}>DESTINATION</Text>
              <Text style={styles.locAddr}>
                {destAddr ?? `${currentTrip.dest_lat.toFixed(5)}, ${currentTrip.dest_lng.toFixed(5)}`}
              </Text>
            </View>
          </View>

          {(currentTrip.distance_km != null || currentTrip.duration_min != null) && (
            <Text style={styles.meta}>
              {currentTrip.distance_km != null ? `🛣️ ${currentTrip.distance_km.toFixed(1)} mi` : ""}
              {currentTrip.distance_km != null && currentTrip.duration_min != null ? "   " : ""}
              {currentTrip.duration_min != null ? `⏱️ ~${currentTrip.duration_min} min` : ""}
            </Text>
          )}
        </>
      )}

      <TouchableOpacity style={styles.navButton} onPress={handleNavigate}>
        <Text style={styles.navText}>
          🧭 {status === "in_progress" ? "Navigate to destination" : "Navigate to pickup"}
        </Text>
      </TouchableOpacity>

      <ActiveTripActions
        status={status}
        onStart={handleStart}
        onComplete={handleComplete}
        loading={loading}
      />

      {token && (status === "accepted" || status === "in_progress") && (
        <ChatPanel token={token} tripId={tripId} accent="#2563EB" />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 8 },
  status: { fontSize: 16, color: "#374151", marginBottom: 4 },
  price: { fontSize: 24, fontWeight: "bold", color: "#1D4ED8", marginBottom: 16 },
  mapWrap: { borderRadius: 10, overflow: "hidden", marginBottom: 12 },
  locRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  locIcon: { fontSize: 18, lineHeight: 22 },
  locText: { flex: 1 },
  locLabel: { fontSize: 11, fontWeight: "700", color: "#6B7280", letterSpacing: 0.4 },
  locAddr: { fontSize: 14, color: "#111827" },
  meta: { fontSize: 14, color: "#374151", marginBottom: 12 },
  navButton: {
    backgroundColor: "#DBEAFE",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  navText: { color: "#1D4ED8", fontWeight: "600", fontSize: 15 },
});
