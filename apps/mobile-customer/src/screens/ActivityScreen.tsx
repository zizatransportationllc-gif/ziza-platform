/**
 * ActivityScreen — unified history (rides + assistance).
 * Sprint 65 — 4-tab navigation: rendered as the "Activity" tab pane.
 *
 * A single segmented filter [All | Rides | Assistance] over the customer's
 * past trips and their assistance requests.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import {
  listTripHistory,
  getMyCraftRequests,
  TripResponse,
  CraftRequest,
} from "../api";
import { useAuth } from "../context/AuthContext";
import TripCard from "../components/TripCard";

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type Filter = "all" | "rides" | "assistance";

const STATUS_COLORS: Record<string, string> = {
  open: "#059669",
  bidding_closed: "#D97706",
  assigned: "#2563EB",
  arrived: "#2563EB",
  in_progress: "#7C3AED",
  pro_done: "#7C3AED",
  completed: "#6B7280",
  cancelled: "#EF4444",
};

export default function ActivityScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation<NavProp>();
  const [filter, setFilter] = useState<Filter>("all");
  const [trips, setTrips] = useState<TripResponse[]>([]);
  const [requests, setRequests] = useState<CraftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showLoader = true) => {
    if (!token) return;
    if (showLoader) setLoading(true);
    try {
      const [t, r] = await Promise.all([
        listTripHistory(token).catch(() => []),
        getMyCraftRequests(token).catch(() => []),
      ]);
      setTrips(t);
      setRequests(r);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const showRides = filter === "all" || filter === "rides";
  const showAssistance = filter === "all" || filter === "assistance";

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(false); }}
          tintColor="#F97316"
        />
      }
    >
      <View style={styles.filterRow}>
        {(["all", "rides", "assistance"] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === "all" ? "All" : f === "rides" ? "Rides" : "Assistance"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {showRides && (
        <View style={styles.group}>
          {filter === "all" && <Text style={styles.groupTitle}>🚕 Rides</Text>}
          {trips.length === 0 ? (
            <Text style={styles.empty}>No trips yet.</Text>
          ) : (
            trips.map((t) => <TripCard key={t.trip_id} trip={t} onPay={undefined} />)
          )}
        </View>
      )}

      {showAssistance && (
        <View style={styles.group}>
          {filter === "all" && <Text style={styles.groupTitle}>🔧 Assistance</Text>}
          {requests.length === 0 ? (
            <Text style={styles.empty}>No assistance requests yet.</Text>
          ) : (
            requests.map((item) => {
              const canSeeBids = item.status !== "cancelled";
              const bidsStage = ["open", "bidding_closed"].includes(item.status);
              return (
                <View key={item.request_id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.category}>{item.category.toUpperCase()}</Text>
                    <Text style={[styles.status, { color: STATUS_COLORS[item.status] ?? "#6B7280" }]}>
                      {item.status.replace("_", " ")}
                    </Text>
                  </View>
                  <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
                  {item.address ? <Text style={styles.meta}>📍 {item.address}</Text> : null}
                  <Text style={styles.date}>
                    Posted: {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                  {canSeeBids && (
                    <TouchableOpacity
                      style={styles.bidsBtn}
                      onPress={() =>
                        navigation.navigate("Bids", {
                          requestId: item.request_id,
                          customerLat: item.lat,
                          customerLng: item.lng,
                        })
                      }
                    >
                      <Text style={styles.bidsBtnText}>{bidsStage ? "View Bids →" : "View Details →"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: "#F97316", borderColor: "#F97316" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  chipTextActive: { color: "#fff" },
  group: { marginBottom: 20 },
  groupTitle: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 8 },
  empty: { color: "#9CA3AF", textAlign: "center", marginVertical: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  category: {
    fontSize: 12,
    fontWeight: "700",
    color: "#F97316",
    backgroundColor: "#FFF7ED",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  status: { fontSize: 12, fontWeight: "600" },
  description: { fontSize: 14, color: "#374151", marginBottom: 6 },
  meta: { fontSize: 12, color: "#6B7280", marginBottom: 4 },
  date: { fontSize: 11, color: "#D1D5DB", marginBottom: 8 },
  bidsBtn: {
    backgroundColor: "#FFF7ED",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  bidsBtnText: { color: "#F97316", fontWeight: "700", fontSize: 13 },
});
