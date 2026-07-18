/**
 * MyCraftRequestsScreen — customer views their own craft requests.
 * Sprint 47 — Ziza Craft.
 *
 * Shows status, category, bid count link, and option to view bids.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { getMyCraftRequests, CraftRequest } from "../api";
import { useAuth } from "../context/AuthContext";

type NavProp = NativeStackNavigationProp<RootStackParamList, "MyCraftRequests">;

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

export default function MyCraftRequestsScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation<NavProp>();
  const [requests, setRequests] = useState<CraftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async (showLoader = true) => {
    if (!token) return;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const items = await getMyCraftRequests(token);
      setRequests(items);
    } catch (e: any) {
      setError(e.message || "Failed to load requests");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const renderRequest = ({ item }: { item: CraftRequest }) => {
    // The customer can open the detail at every stage (to confirm arrival, see
    // the code/photos, confirm completion, pay) — only a cancelled request has
    // nothing to show.
    const canSeeBids = item.status !== "cancelled";
    const bidsStage = ["open", "bidding_closed"].includes(item.status);
    const deadline = item.bid_deadline ? new Date(item.bid_deadline) : null;
    const isExpired = deadline ? deadline < new Date() : false;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.category}>{item.category.toUpperCase()}</Text>
          <Text style={[styles.status, { color: STATUS_COLORS[item.status] ?? "#6B7280" }]}>
            {item.status.replace("_", " ")}
          </Text>
        </View>

        <Text style={styles.description} numberOfLines={2}>{item.description}</Text>

        {item.address ? (
          <Text style={styles.meta}>📍 {item.address}</Text>
        ) : null}

        {deadline && !isExpired && item.status === "open" ? (
          <Text style={styles.deadline}>
            ⏱ Bidding until: {deadline.toLocaleTimeString()}
          </Text>
        ) : null}

        {isExpired && item.status === "open" ? (
          <Text style={styles.expired}>⏰ Bidding window closed</Text>
        ) : null}

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
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.newRequestBtn}
        onPress={() => navigation.navigate("CraftRequest")}
      >
        <Text style={styles.newRequestBtnText}>+ New Request</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={requests}
        keyExtractor={(item) => item.request_id}
        renderItem={renderRequest}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadRequests(false);
            }}
            tintColor="#1D4ED8"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.empty}>No craft requests yet.</Text>
            <TouchableOpacity
              style={styles.postFirstBtn}
              onPress={() => navigation.navigate("CraftRequest")}
            >
              <Text style={styles.postFirstBtnText}>Post Your First Request</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  newRequestBtn: {
    backgroundColor: "#1D4ED8",
    margin: 12,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  newRequestBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  list: { padding: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  category: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1D4ED8",
    backgroundColor: "#EEF3FE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  status: { fontSize: 12, fontWeight: "600" },
  description: { fontSize: 14, color: "#374151", marginBottom: 6 },
  meta: { fontSize: 12, color: "#6B7280", marginBottom: 4 },
  deadline: { fontSize: 12, color: "#D97706", marginBottom: 4 },
  expired: { fontSize: 12, color: "#9CA3AF", marginBottom: 4 },
  date: { fontSize: 11, color: "#D1D5DB", marginBottom: 8 },
  bidsBtn: {
    backgroundColor: "#EEF3FE",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#C7D7F7",
  },
  bidsBtnText: { color: "#1D4ED8", fontWeight: "700", fontSize: 13 },
  emptyContainer: { alignItems: "center", marginTop: 60 },
  empty: { color: "#9CA3AF", fontSize: 16, marginBottom: 16 },
  postFirstBtn: {
    backgroundColor: "#1D4ED8",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  postFirstBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  errorText: { color: "#EF4444", textAlign: "center", padding: 12 },
});
