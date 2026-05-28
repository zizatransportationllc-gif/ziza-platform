/**
 * AssistanceScreen — request roadside assistance.
 * Sprint 35
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { requestAssistance, AssistanceResponse } from "../api";
import { useAuth } from "../context/AuthContext";

const ASSISTANCE_TYPES = [
  { key: "flat_tire", label: "Flat Tire" },
  { key: "breakdown", label: "Breakdown" },
  { key: "accident", label: "Accident" },
  { key: "other", label: "Other" },
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
      // Newark, NJ demo location — real app uses device GPS
      const res = await requestAssistance(token, type, 40.7357, -74.1724);
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
        <Text style={styles.success}>Request sent ✓</Text>
        <Text style={styles.detail}>Type: {request.type}</Text>
        <Text style={styles.detail}>Status: {request.status}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Request Assistance</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator size="large" color="#F97316" />
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
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 20 },
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
  detail: { textAlign: "center", color: "#374151", fontSize: 16 },
  error: { color: "red", marginBottom: 12 },
});
