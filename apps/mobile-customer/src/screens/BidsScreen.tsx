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
  Share,
  TextInput,
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
  getCraftTracking,
  createCraftShareUrl,
  createCraftRating,
  getCraftRating,
  CraftBid,
  CraftRequest,
  CraftPhoto,
  CraftTracking,
  CraftRating,
} from "../api";
import CraftTrackingMap from "../components/CraftTrackingMap";
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

// Post-job rating — stars + optional comment, shown once completed.
function RatingBlock({ token, requestId }: { token: string; requestId: string }): React.ReactElement | null {
  const [existing, setExisting] = useState<CraftRating | null | undefined>(undefined);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCraftRating(token, requestId).then((r) => setExisting(r ?? null)).catch(() => setExisting(null));
  }, [token, requestId]);

  const submit = async () => {
    if (!stars) return;
    setBusy(true);
    try {
      setExisting(await createCraftRating(token, requestId, stars, comment.trim() || null));
    } catch (e: any) {
      Alert.alert("Error", e.message || "Couldn't submit rating");
    } finally {
      setBusy(false);
    }
  };

  if (existing === undefined) return null;
  const shown = existing ? existing.stars : stars;

  return (
    <View style={rt.box}>
      <Text style={rt.title}>Rate your professional</Text>
      <View style={rt.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} disabled={!!existing} onPress={() => setStars(n)}>
            <Text style={[rt.star, n <= shown && rt.starOn]}>★</Text>
          </TouchableOpacity>
        ))}
      </View>
      {existing ? (
        <>
          {existing.comment ? <Text style={rt.comment}>“{existing.comment}”</Text> : null}
          <Text style={rt.thanks}>Thanks for your feedback!</Text>
        </>
      ) : (
        <>
          <TextInput
            style={rt.input}
            placeholder="Add a comment (optional)…"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[rt.btn, (!stars || busy) && rt.btnDisabled]}
            onPress={submit}
            disabled={!stars || busy}
          >
            <Text style={rt.btnText}>{busy ? "Sending…" : "Submit rating"}</Text>
          </TouchableOpacity>
        </>
      )}
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
  const [sortBy, setSortBy] = useState<"price" | "eta" | "rating">("price");

  const sortedBids = [...bids].sort((a, b) => {
    if (sortBy === "eta") return a.eta_min - b.eta_min;
    if (sortBy === "rating") return (b.professional_rating ?? -1) - (a.professional_rating ?? -1);
    return a.price_cents - b.price_cents;
  });

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

  // While bidding is open, refresh so new offers appear live (no manual pull).
  useEffect(() => {
    const st = request?.status;
    if (st !== "open" && st !== "bidding_closed") return;
    const id = setInterval(() => loadData(false), 7000);
    return () => clearInterval(id);
  }, [request?.status, loadData]);

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

  // Share a public live-tracking link with a relative (native share sheet).
  const handleShare = async () => {
    if (!token) return;
    try {
      const url = await createCraftShareUrl(token, requestId);
      await Share.share({ message: `Follow my ZIZA roadside assistance live: ${url}` });
    } catch {
      Alert.alert("Error", "Couldn't create the share link.");
    }
  };

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

  // Live position of the assigned pro (null until they push one). Poll while the
  // pro is travelling / on site.
  const [tracking, setTracking] = useState<CraftTracking | null>(null);
  useEffect(() => {
    const st = request?.status;
    if (!token || !st || !["assigned", "arrived", "in_progress"].includes(st)) {
      setTracking(null);
      return;
    }
    let active = true;
    const tick = () =>
      getCraftTracking(token, requestId).then((t) => { if (active) setTracking(t); }).catch(() => {});
    tick();
    const id = setInterval(tick, 5000);
    return () => { active = false; clearInterval(id); };
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

        {/* Professional identity + average rating */}
        <View style={styles.proRow}>
          {item.professional_avatar_url ? (
            <Image source={{ uri: item.professional_avatar_url }} style={styles.proAvatar} />
          ) : (
            <View style={[styles.proAvatar, styles.proAvatarPh]}>
              <Text style={styles.proAvatarPhText}>
                {(item.professional_name || "P").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.proMeta}>
            <Text style={styles.proName} numberOfLines={1}>
              {item.professional_name || "Professional"}
            </Text>
            <Text style={styles.proRating}>
              {item.professional_rating != null
                ? `★ ${item.professional_rating.toFixed(1)} · ${item.professional_rating_count} rating${item.professional_rating_count > 1 ? "s" : ""}`
                : "No ratings yet"}
            </Text>
          </View>
        </View>

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
            const etaMin = tracking?.eta_min ?? accepted.eta_min;
            const line =
              request.status === "assigned" ? `🚗 On the way — ~${etaMin} min away`
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
          {["assigned", "arrived", "in_progress"].includes(request.status) && (
            <>
              <View style={styles.mapWrap}>
                <CraftTrackingMap
                  customerLat={request.lat}
                  customerLng={request.lng}
                  proLat={tracking?.pro_lat ?? null}
                  proLng={tracking?.pro_lng ?? null}
                />
              </View>
              {!tracking?.pro_lat && (
                <Text style={styles.trackWaiting}>🛰️ Waiting for the professional's live position…</Text>
              )}
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                <Text style={styles.shareBtnText}>🔗 Share live tracking</Text>
              </TouchableOpacity>
            </>
          )}
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
          {token && request.status === "completed" && (
            <RatingBlock token={token} requestId={requestId} />
          )}
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={sortedBids}
        keyExtractor={(item) => item.bid_id}
        renderItem={renderBid}
        ListHeaderComponent={
          bids.length > 1 ? (
            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>Sort by</Text>
              {(["price", "eta", "rating"] as const).map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.sortChip, sortBy === k && styles.sortChipOn]}
                  onPress={() => setSortBy(k)}
                >
                  <Text style={[styles.sortChipText, sortBy === k && styles.sortChipTextOn]}>
                    {k === "price" ? "Price" : k === "eta" ? "ETA" : "Rating"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null
        }
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
          <Text style={styles.empty}>
            {request && ["open", "bidding_closed"].includes(request.status)
              ? "⏳ Waiting for nearby professionals to send their offers…"
              : "No bids received yet."}
          </Text>
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
  mapWrap: { marginTop: 12, borderRadius: 10, overflow: "hidden" },
  shareBtn: {
    marginTop: 10, borderWidth: 1, borderColor: "#1D4ED8", borderRadius: 8,
    paddingVertical: 11, alignItems: "center",
  },
  shareBtnText: { color: "#1D4ED8", fontWeight: "700", fontSize: 14 },
  trackWaiting: { marginTop: 8, fontSize: 12, color: "#6B7280", textAlign: "center" },
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
  proRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  proAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#E5E7EB" },
  proAvatarPh: { alignItems: "center", justifyContent: "center", backgroundColor: "#1D4ED8" },
  proAvatarPhText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  proMeta: { flex: 1, minWidth: 0 },
  proName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  proRating: { fontSize: 13, fontWeight: "600", color: "#F5B301", marginTop: 1 },
  sortRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  sortLabel: { fontSize: 12, color: "#6B7280" },
  sortChip: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: "#D1D5DB", backgroundColor: "#fff" },
  sortChipOn: { backgroundColor: "#1D4ED8", borderColor: "#1D4ED8" },
  sortChipText: { fontSize: 12, fontWeight: "600", color: "#374151" },
  sortChipTextOn: { color: "#fff" },
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

// Post-job rating styles
const rt = StyleSheet.create({
  box: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  title: { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 8 },
  starsRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  star: { fontSize: 30, color: "#D1D5DB", lineHeight: 34 },
  starOn: { color: "#F5B301" },
  comment: { fontStyle: "italic", color: "#6B7280", marginBottom: 4 },
  thanks: { color: "#16A34A", fontWeight: "600", fontSize: 13 },
  input: {
    borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8, padding: 10,
    minHeight: 52, textAlignVertical: "top", backgroundColor: "#F9FAFB", marginBottom: 8,
  },
  btn: { backgroundColor: "#1D4ED8", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
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
