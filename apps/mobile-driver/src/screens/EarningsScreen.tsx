/**
 * EarningsScreen — driver earnings dashboard.
 * Sprint 37 — uses useAuth() instead of props.
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useAuth } from "../context/AuthContext";
import { getMyEarnings, EarningsResponse } from "../api";
import EarningsChart from "../components/EarningsChart";

export default function EarningsScreen(): React.ReactElement {
  const { token } = useAuth();
  const [earnings, setEarnings] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    getMyEarnings(token)
      .then(setEarnings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Mes gains</Text>
      {earnings && (
        <>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total cumulé</Text>
            <Text style={styles.totalAmount}>{earnings.total_xof.toLocaleString()} XOF</Text>
            <Text style={styles.totalTrips}>{earnings.total_trips} trajets</Text>
          </View>
          <EarningsChart
            todayXof={earnings.today_xof}
            weekXof={earnings.week_xof}
            totalXof={earnings.total_xof}
          />
          <View style={styles.row}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Aujourd'hui</Text>
              <Text style={styles.statValue}>{earnings.today_xof.toLocaleString()}</Text>
              <Text style={styles.statSub}>{earnings.today_trips} trajets</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Cette semaine</Text>
              <Text style={styles.statValue}>{earnings.week_xof.toLocaleString()}</Text>
              <Text style={styles.statSub}>{earnings.week_trips} trajets</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  totalCard: {
    backgroundColor: "#1D4ED8",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  totalLabel: { color: "#BFDBFE", fontSize: 13 },
  totalAmount: { color: "#fff", fontSize: 32, fontWeight: "bold" },
  totalTrips: { color: "#93C5FD", fontSize: 14, marginTop: 4 },
  row: { flexDirection: "row", gap: 12, marginTop: 16 },
  statBox: {
    flex: 1,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  statLabel: { fontSize: 12, color: "#6B7280" },
  statValue: { fontSize: 20, fontWeight: "bold", color: "#1D4ED8" },
  statSub: { fontSize: 12, color: "#9CA3AF" },
});
