/**
 * BidsScreen — customer reviews bids received for a craft request and selects one.
 * Sprint 47 — Ziza Craft.
 *
 * For each bid the customer sees:
 *   - Price (USD)
 *   - ETA (minutes)
 *   - Distance from customer to professional (km)
 *   - Professional's note
 *   - Status badge
 *   - "Select this professional" button (only for open/bidding_closed requests)
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import ChatPanel from "../components/ChatPanel";
import {
  getBidsForRequest,
  selectCraftBid,
  getCraftRequest,
  CraftBid,
  CraftRequest,
} from "../api";
import { useAuth } from "../context/AuthContext";

type RouteProps = RouteProp<RootStackParamList, "Bids">;
type NavProp = NativeStackNavigationProp<RootStackParamList, "Bids">;

function formatUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function BidsScreen(): React.ReactElement {
  const { token } = useAuth();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProp>();
  const { requestId, customerLat, customerLng } = route.params;

  const [request, setRequest] = useState<CraftRequest | null>(null);
  const [bids, setBids] = useState<CraftBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  const loadData = useCallback(async (showLoader = true) => {
    if (!token) return;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const [req, bidList] = await Promise.all([
        getCraftRequest(token, requestId),
        getBidsForRequest(token, requestId, customerLat, customerLng),
      ]);
      setRequest(req);
      setBids(bidList);
    } catch (e: any) {
      setError(e.message || "Failed to load bids");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, requestId, customerLat, customerLng]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelect = (bid: CraftBid) => {
    Alert.alert(
      "Select Professional",
      `Confirm selecting this professional for ${formatUSD(bid.price_cents)}?\nETA: ${bid.eta_min} min${bid.distance_km != null ? ` · ${bid.distance_km.toFixed(1)} km away` : ""}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            if (!token) return;
            setSelecting(bid.bid_id);
            try {
              await selectCraftBid(token, requestId, bid.bid_id);
              Alert.alert(
                "Professional Selected",
                "The professional has been notified. Your request is now assigned.",
                [{ text: "OK", onPress: () => navigation.navigate("MyCraftRequests") }]
              );
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to select bid");
            } finally {
              setSelecting(null);
            }
          },
        },
      ]
    );
  };

  const canSelect = request?.status === "open" || request?.status === "bidding_closed";

  const renderBid = ({ item }: { item: CraftBid }) => {
    const isSelected = item.bid_id === request?.selected_bid_id;
    const isSelecting = selecting === item.bid_id;

    return (
      <View style={[styles.card, isSelected && styles.cardSelected]}>
        {isSelected && (
          <View style={styles.selectedBanner}>
            <Text style={styles.selectedBannerText}>✓ Selected</Text>
          </View>
        )}

        {/* Price + ETA */}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatUSD(item.price_cents)}</Text>
          <Text style={styles.eta}>⏱ {item.eta_min} min</Text>
        </View>

        {/* Distance */}
        {item.distance_km != null && (
          <Text style={styles.distance}>📏 {item.distance_km.toFixed(1)} km from you</Text>
        )}

        {/* Note */}
        {item.note ? (
          <Text style={styles.note} numberOfLines={3}>💬 {item.note}</Text>
        ) : null}

        <Text style={styles.date}>Bid at: {new Date(item.created_at).toLocaleString()}</Text>

        {/* Select button */}
        {canSelect && item.status === "pending" && (
          <TouchableOpacity
            style={[styles.selectBtn, isSelecting && styles.selectBtnDisabled]}
            onPress={() => handleSelect(item)}
            disabled={!!selecting}
          >
            {isSelecting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.selectBtnText}>Select This Professional</Text>
            )}
          </TouchableOpacity>
        )}

        {item.status !== "pending" && (
          <Text style={[
            styles.bidStatus,
            item.status === "accepted" ? styles.bidAccepted : styles.bidRejected,
          ]}>
            {item.status === "accepted" ? "✓ Accepted" : "✗ Not selected"}
          </Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {request && (
        <View style={styles.requestHeader}>
          <Text style={styles.requestCategory}>{request.category.toUpperCase()}</Text>
          <Text style={styles.requestDesc} numberOfLines={2}>{request.description}</Text>
        </View>
      )}

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
              loadData(false);
            }}
            tintColor="#F97316"
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No bids received yet. Check back soon.</Text>
        }
        ListFooterComponent={
          token && bids.some((b) => b.status === "accepted")
            ? <ChatPanel token={token} scope="request" id={requestId} accent="#F97316" />
            : null
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  requestHeader: {
    backgroundColor: "#fff",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  requestCategory: {
    fontSize: 12,
    fontWeight: "700",
    color: "#F97316",
    marginBottom: 4,
  },
  requestDesc: { fontSize: 14, color: "#374151" },
  list: { padding: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardSelected: { borderColor: "#F97316", borderWidth: 2 },
  selectedBanner: {
    backgroundColor: "#FFF7ED",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  selectedBannerText: { color: "#F97316", fontWeight: "700", fontSize: 12 },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  price: { fontSize: 24, fontWeight: "bold", color: "#111827" },
  eta: { fontSize: 16, fontWeight: "600", color: "#059669" },
  distance: { fontSize: 13, color: "#6B7280", marginBottom: 6 },
  note: { fontSize: 13, color: "#374151", fontStyle: "italic", marginBottom: 6 },
  date: { fontSize: 11, color: "#D1D5DB", marginBottom: 8 },
  selectBtn: {
    backgroundColor: "#F97316",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  selectBtnDisabled: { opacity: 0.6 },
  selectBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  bidStatus: { textAlign: "center", fontSize: 13, fontWeight: "600", paddingVertical: 4 },
  bidAccepted: { color: "#059669" },
  bidRejected: { color: "#9CA3AF" },
  empty: { textAlign: "center", color: "#9CA3AF", marginTop: 60, fontSize: 16 },
  errorText: { color: "#EF4444", textAlign: "center", padding: 12 },
});
