/**
 * AssistanceScreen — request roadside assistance.
 * Sprint 38 — uses real device GPS (expo-location) instead of hardcoded coords.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Location from "expo-location";
import { requestAssistance, AssistanceResponse } from "../api";
import { useAuth } from "../context/AuthContext";

const ASSISTANCE_TYPES = [
  { key: "flat_tire", label: "🔴 Flat Tire" },
  { key: "breakdown", label: "🔧 Breakdown" },
  { key: "accident", label: "💥 Accident" },
  { key: "other", label: "❓ Other" },
];

export default function AssistanceScreen(): React.ReactElement {
  const { token } = useAuth();
  const [request, setRequest] = useState<AssistanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async (type: string) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // Request foreground location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location required",
          "Please enable location access so Ziza can send help to your exact position.",
        );
        return;
      }

      // Get current position (high accuracy, timeout 10 s)
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const res = await requestAssistance(
        token,
        type,
        pos.coords.latitude,
        pos.coords.longitude,
      );
      setRequest(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (request) {
    return (
      <View style={styles.container}>
        <Text style={styles.success}>✓ Request sent</Text>
        <Text style={styles.detail}>Type: {request.type}</Text>
        <Text style={styles.detail}>Status: {request.status}</Text>
        <Text style={styles.hint}>Help is on the way. Stay with your vehicle.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Request Assistance</Text>
      <Text style={styles.sub}>Your GPS location will be shared automatically.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#F97316" />
          <Text style={styles.loadingText}>Getting your location…</Text>
        </View>
      ) : (
        ASSISTANCE_TYPES.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={styles.typeButton}
            onPress={() => handleRequest(t.key)}
          >
            <Text style={styles.typeText}>{t.label}</Text>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 4 },
  sub: { fontSize: 13, color: "#6B7280", marginBottom: 20 },
  typeButton: {
    borderWidth: 1,
    borderColor: "#F97316",
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    alignItems: "center",
  },
  typeText: { fontSize: 16, color: "#F97316", fontWeight: "600" },
  success: { fontSize: 20, color: "#16A34A", fontWeight: "bold", textAlign: "center", marginBottom: 12 },
  detail: { textAlign: "center", color: "#374151", fontSize: 16, marginBottom: 4 },
  hint: { textAlign: "center", color: "#6B7280", fontSize: 14, marginTop: 16 },
  error: { color: "red", marginBottom: 12 },
  loadingBox: { alignItems: "center", marginTop: 40, gap: 12 },
  loadingText: { color: "#6B7280", fontSize: 15 },
});
