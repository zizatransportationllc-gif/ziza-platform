/**
 * MyBidsScreen — professional's submitted bids history.
 * Sprint 47 — Ziza Craft.
 *
 * Shows each bid with: request category, price, ETA, status (pending/accepted/rejected).
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { getMyBids, CraftBid, formatUSD } from "../api";
import { useAuth } from "../context/AuthContext";

type MyBidsNavProp = NativeStackNavigationProp<RootStackParamList, "MyBids">;

const STATUS_COLORS: Record<string, string> = {
  pending: "#D97706",
  accepted: "#1D4ED8",
  rejected: "#EF4444",
};

// Distances are stored in km; display in miles (US). 1 mi = 1.609344 km.
const fmtMiles = (km: number): string => (km / 1.609344).toFixed(1);

export default function MyBidsScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation<MyBidsNavProp>();
  const [bids, setBids] = useState<CraftBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBids = useCallback(async (showLoader = true) => {
    if (!token) return;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const items = await getMyBids(token);
      setBids(items);
    } catch (e: any) {
      setError(e.message || "Failed to load bids");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadBids();
  }, [loadBids]);

  const renderBid = ({ item }: { item: CraftBid }) => {
    const accepted = item.status === "accepted";
    const openJob = () =>
      navigation.navigate("RequestDetail", { requestId: item.request_id, canManage: true });
    const Wrapper: any = accepted ? TouchableOpacity : View;
    return (
      <Wrapper style={[styles.card, accepted && styles.cardAccepted]} onPress={accepted ? openJob : undefined}>
        <View style={styles.cardRow}>
          <Text style={styles.bidId}>Bid #{item.bid_id.slice(0, 8)}</Text>
          <Text style={[styles.statusBadge, { color: STATUS_COLORS[item.status] ?? "#6B7280" }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>

        <Text style={styles.price}>{formatUSD(item.price_cents)}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaItem}>⏱ ETA: {item.eta_min} min</Text>
          {item.distance_km != null && (
            <Text style={styles.metaItem}>📏 {fmtMiles(item.distance_km)} mi</Text>
          )}
        </View>

        {item.note ? (
          <Text style={styles.note} numberOfLines={2}>💬 {item.note}</Text>
        ) : null}

        <Text style={styles.date}>
          Submitted: {new Date(item.created_at).toLocaleDateString()}
        </Text>

        {accepted && (
          <View style={styles.openBtn}>
            <Text style={styles.openBtnText}>🧭 Open job & navigate to customer →</Text>
          </View>
        )}
      </Wrapper>
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
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <FlatList
        data={bids}
        keyExtractor={(item) => item.bid_id}
        renderItem={renderBid}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadBids(false);
            }}
            tintColor="#1D4ED8"
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>You haven't submitted any bids yet.</Text>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardAccepted: { borderColor: "#1D4ED8", borderWidth: 2 },
  openBtn: { marginTop: 12, backgroundColor: "#1D4ED8", borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  openBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  bidId: { fontSize: 12, color: "#9CA3AF" },
  statusBadge: { fontSize: 12, fontWeight: "700" },
  price: { fontSize: 24, fontWeight: "bold", color: "#111827", marginBottom: 6 },
  metaRow: { flexDirection: "row", gap: 16, marginBottom: 4 },
  metaItem: { fontSize: 13, color: "#6B7280" },
  note: { fontSize: 13, color: "#374151", fontStyle: "italic", marginBottom: 4 },
  date: { fontSize: 11, color: "#D1D5DB", marginTop: 4 },
  empty: { textAlign: "center", color: "#9CA3AF", marginTop: 60, fontSize: 16 },
  errorText: { color: "#EF4444", textAlign: "center", padding: 12 },
});
