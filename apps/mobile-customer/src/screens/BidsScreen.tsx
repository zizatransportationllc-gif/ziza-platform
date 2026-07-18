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
  Image,
  ScrollView,
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
  craftConfirmArrival,
  craftComplete,
  listCraftPhotos,
  createCraftPaymentIntent,
  getCraftPayment,
  simulateCraftPayment,
  CraftBid,
  CraftRequest,
  CraftPhoto,
} from "../api";
import { Linking } from "react-native";
import { useAuth } from "../context/AuthContext";

type RouteProps = RouteProp<RootStackParamList, "Bids">;
type NavProp = NativeStackNavigationProp<RootStackParamList, "Bids">;

function formatUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

// Distances are stored in km; display in miles (US). 1 mi = 1.609344 km.
const fmtMiles = (km: number): string => (km / 1.609344).toFixed(1);

// Customer-facing progress milestones for an assistance job.
const TL_STEPS = ["Requested", "On the way", "Arrived", "In progress", "Done"];
const STATUS_STEP: Record<string, number> = {
  open: 0, bidding_closed: 0,
  assigned: 1, arrived: 2,
  in_progress: 3, pro_done: 3,
  completed: 4,
};

/** Horizontal step timeline showing where the job is right now. */
function StatusTimeline({ status }: { status: string }): React.ReactElement | null {
  if (status === "cancelled") return null;
  const current = STATUS_STEP[status] ?? 0;
  const complete = status === "completed";
  const last = TL_STEPS.length - 1;
  return (
    <View style={tl.row}>
      {TL_STEPS.map((label, i) => {
        const done = complete || i < current;
        const active = !complete && i === current;
        const leftOn = i <= current || complete;   // segment reaching this dot
        const rightOn = i < current || complete;    // segment leaving this dot
        return (
          <View key={label} style={tl.step}>
            <View style={tl.track}>
              <View style={[tl.seg, i === 0 && tl.segHidden, leftOn && tl.segOn]} />
              <View style={[tl.dot, done && tl.dotDone, active && tl.dotActive]}>
                <Text style={[tl.dotText, (done || active) && tl.dotTextOn]}>
                  {done ? "✓" : String(i + 1)}
                </Text>
              </View>
              <View style={[tl.seg, i === last && tl.segHidden, rightOn && tl.segOn]} />
            </View>
            <Text style={[tl.label, active && tl.labelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
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
      `Confirm selecting this professional for ${formatUSD(bid.price_cents)}?\nETA: ${bid.eta_min} min${bid.distance_km != null ? ` · ${fmtMiles(bid.distance_km)} mi away` : ""}`,
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
              const msg = e?.message || "Failed to select bid";
              if (msg.toLowerCase().includes("payment card")) {
                Alert.alert("Add a payment card", "You need a saved card to select a professional.", [
                  { text: "Not now", style: "cancel" },
                  { text: "Add a card", onPress: () => navigation.navigate("PaymentMethods") },
                ]);
              } else {
                Alert.alert("Error", msg);
              }
            } finally {
              setSelecting(null);
            }
          },
        },
      ]
    );
  };

  const canSelect = request?.status === "open" || request?.status === "bidding_closed";

  const [actionBusy, setActionBusy] = useState(false);
  const runAction = async (fn: (t: string, id: string) => Promise<CraftRequest>) => {
    if (!token) return;
    setActionBusy(true);
    try { setRequest(await fn(token, requestId)); }
    catch (e: any) { Alert.alert("Error", e.message || "Action failed"); }
    finally { setActionBusy(false); }
  };

  // Payment once the job is completed
  const [paying, setPaying] = useState(false);
  const handlePay = async () => {
    if (!token) return;
    setPaying(true);
    try {
      const intent = await createCraftPaymentIntent(token, requestId);
      if (intent.checkout_url && intent.checkout_url.includes("localhost")) {
        // Dev/mock provider — confirm via the webhook, then refresh.
        if (intent.provider_ref) await simulateCraftPayment(intent.provider_ref);
        await loadData(false);
      } else if (intent.checkout_url) {
        Linking.openURL(intent.checkout_url).catch(() => {});
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  // Before/after photos from the professional (read-only)
  const [photos, setPhotos] = useState<CraftPhoto[]>([]);
  useEffect(() => {
    if (token && request &&
        ["assigned", "arrived", "in_progress", "pro_done", "completed"].includes(request.status)) {
      listCraftPhotos(token, requestId).then(setPhotos).catch(() => {});
    }
  }, [token, requestId, request?.status]);

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
          <Text style={styles.distance}>📏 {fmtMiles(item.distance_km)} mi from you</Text>
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
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {request && (
        <View style={styles.requestHeader}>
          <Text style={styles.requestCategory}>{request.category.toUpperCase()}</Text>
          <Text style={styles.requestDesc} numberOfLines={2}>{request.description}</Text>
          {["assigned", "arrived", "in_progress", "pro_done", "completed"].includes(request.status) && (
            <StatusTimeline status={request.status} />
          )}
          {(() => {
            const accepted = bids.find((b) => b.status === "accepted");
            if (!accepted || !["assigned", "arrived", "in_progress", "pro_done", "completed"].includes(request.status)) return null;
            const line =
              request.status === "assigned" ? `🚗 On the way — ~${accepted.eta_min} min away`
              : request.status === "arrived" ? "📍 On site"
              : request.status === "completed" ? "✅ Job done"
              : "🔧 Working on it";
            return (
              <View style={styles.proCard}>
                <View style={styles.proHead}>
                  <Text style={styles.proTitle}>YOUR PROFESSIONAL</Text>
                  <Text style={styles.proPrice}>{formatUSD(accepted.price_cents)}</Text>
                </View>
                <Text style={styles.proStatus}>{line}</Text>
              </View>
            );
          })()}
          {request.verification_code &&
            ["assigned", "arrived", "in_progress", "pro_done", "completed"].includes(request.status) && (
              <View style={styles.codeCard}>
                <Text style={styles.codeLabel}>🔐 VERIFICATION CODE</Text>
                <Text style={styles.codeValue}>{request.verification_code}</Text>
              </View>
            )}
          {request.status === "arrived" && (
            <TouchableOpacity style={styles.lifeBtn} onPress={() => runAction(craftConfirmArrival)} disabled={actionBusy}>
              <Text style={styles.lifeBtnText}>✅ Confirm the professional has arrived</Text>
            </TouchableOpacity>
          )}
          {request.status === "pro_done" && (
            <TouchableOpacity style={styles.lifeBtn} onPress={() => runAction(craftComplete)} disabled={actionBusy}>
              <Text style={styles.lifeBtnText}>✅ Confirm the work is finished</Text>
            </TouchableOpacity>
          )}
          {photos.length > 0 && (
            <View style={styles.photosBox}>
              <Text style={styles.photosTitle}>📷 Photos from your professional</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {photos.map((p) => (p.url ? <Image key={p.photo_id} source={{ uri: p.url }} style={styles.photoThumb} /> : null))}
              </ScrollView>
            </View>
          )}
          {request.status === "completed" && (
            <Text style={styles.paidLabel}>
              {request.paid_at ? "✅ Payment confirmed" : "💳 Charged automatically to your saved card."}
            </Text>
          )}
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
            tintColor="#1D4ED8"
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No bids received yet. Check back soon.</Text>
        }
        ListFooterComponent={
          token && bids.some((b) => b.status === "accepted")
            ? <ChatPanel token={token} scope="request" id={requestId} accent="#1D4ED8" />
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
    color: "#1D4ED8",
    marginBottom: 4,
  },
  requestDesc: { fontSize: 14, color: "#374151" },
  proCard: {
    marginTop: 12, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB",
    borderRadius: 8, padding: 10,
  },
  proHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  proTitle: { fontSize: 11, fontWeight: "700", color: "#6B7280", letterSpacing: 0.4 },
  proPrice: { fontSize: 18, fontWeight: "700", color: "#111827", fontVariant: ["tabular-nums"] },
  proStatus: { marginTop: 2, fontSize: 14, fontWeight: "600", color: "#1D4ED8" },
  codeCard: { marginTop: 10, backgroundColor: "#EEF3FE", borderWidth: 1, borderColor: "#C7D7F7", borderRadius: 8, padding: 10, alignItems: "center" },
  codeLabel: { fontSize: 11, color: "#1E40AF", fontWeight: "600" },
  codeValue: { fontSize: 24, fontWeight: "800", letterSpacing: 6, color: "#1D4ED8", fontVariant: ["tabular-nums"] },
  lifeBtn: { marginTop: 10, backgroundColor: "#1D4ED8", borderRadius: 8, padding: 14, alignItems: "center" },
  lifeBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  photosBox: { marginTop: 12 },
  photosTitle: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  photoThumb: { width: 84, height: 84, borderRadius: 8, marginRight: 8, backgroundColor: "#E5E7EB" },
  paidLabel: { marginTop: 10, color: "#16A34A", fontWeight: "700", fontSize: 14 },
  list: { padding: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardSelected: { borderColor: "#1D4ED8", borderWidth: 2 },
  selectedBanner: {
    backgroundColor: "#EEF3FE",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  selectedBannerText: { color: "#1D4ED8", fontWeight: "700", fontSize: 12 },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  price: { fontSize: 24, fontWeight: "bold", color: "#111827", fontVariant: ["tabular-nums"] },
  eta: { fontSize: 16, fontWeight: "600", color: "#059669", fontVariant: ["tabular-nums"] },
  distance: { fontSize: 13, color: "#6B7280", marginBottom: 6 },
  note: { fontSize: 13, color: "#374151", fontStyle: "italic", marginBottom: 6 },
  date: { fontSize: 11, color: "#D1D5DB", marginBottom: 8 },
  selectBtn: {
    backgroundColor: "#1D4ED8",
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

// Progress timeline styles
const tl = StyleSheet.create({
  row: { flexDirection: "row", marginTop: 12, marginBottom: 2 },
  step: { flex: 1, alignItems: "center" },
  track: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", height: 22 },
  seg: { flex: 1, height: 2, backgroundColor: "#E5E7EB" },
  segHidden: { backgroundColor: "transparent" },
  segOn: { backgroundColor: "#1D4ED8" },
  dot: {
    width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#E5E7EB", backgroundColor: "#fff",
  },
  dotDone: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
  dotActive: { backgroundColor: "#1D4ED8", borderColor: "#1D4ED8" },
  dotText: { fontSize: 11, fontWeight: "700", color: "#9CA3AF" },
  dotTextOn: { color: "#fff" },
  label: { fontSize: 9, color: "#9CA3AF", marginTop: 4, textAlign: "center" },
  labelActive: { color: "#1D4ED8", fontWeight: "700" },
});
