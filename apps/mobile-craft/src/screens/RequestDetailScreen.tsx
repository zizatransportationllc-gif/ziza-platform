/**
 * RequestDetailScreen — shows a craft request and a bid submission form.
 * Sprint 47 — Ziza Craft.
 *
 * Professional can see:
 *   - Category, description, address, bidding deadline
 *   - A form to submit their bid (price in USD, ETA in minutes, optional note)
 *   - Their GPS position is captured at bid time for distance calculation
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Location from "expo-location";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import {
  getCraftRequest,
  submitBid,
  CraftRequest,
  formatUSD,
} from "../api";
import { useAuth } from "../context/AuthContext";
import ChatPanel from "../components/ChatPanel";

type RouteProps = RouteProp<RootStackParamList, "RequestDetail">;
type NavProp = NativeStackNavigationProp<RootStackParamList, "RequestDetail">;

export default function RequestDetailScreen(): React.ReactElement {
  const { token } = useAuth();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProp>();
  const { requestId } = route.params;

  const [request, setRequest] = useState<CraftRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bid form
  const [priceDollars, setPriceDollars] = useState("");
  const [etaMin, setEtaMin] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidSuccess, setBidSuccess] = useState(false);

  // My GPS position for distance data
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        // Grab position in parallel with request load
        const posPromise = (async () => {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === "granted") {
              const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              setMyLat(loc.coords.latitude);
              setMyLng(loc.coords.longitude);
            }
          } catch {
            // location unavailable — bid still works without it
          }
        })();
        const req = await getCraftRequest(token, requestId);
        setRequest(req);
        await posPromise;
      } catch (e: any) {
        setError(e.message || "Failed to load request");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, requestId]);

  const handleSubmitBid = async () => {
    setBidError(null);
    const priceNum = parseFloat(priceDollars);
    const etaNum = parseInt(etaMin, 10);
    if (isNaN(priceNum) || priceNum <= 0) {
      setBidError("Enter a valid price (e.g. 85.00)");
      return;
    }
    if (isNaN(etaNum) || etaNum <= 0) {
      setBidError("Enter a valid ETA in minutes (e.g. 20)");
      return;
    }
    setSubmitting(true);
    try {
      await submitBid(token!, requestId, {
        price_cents: Math.round(priceNum * 100),
        eta_min: etaNum,
        note: note.trim() || null,
        professional_lat: myLat,
        professional_lng: myLng,
      });
      setBidSuccess(true);
      Alert.alert("Bid Submitted", "Your bid has been sent to the customer.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      setBidError(e.message || "Failed to submit bid");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (error || !request) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || "Request not found."}</Text>
      </View>
    );
  }

  const isOpen = request.status === "open";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.category}>{request.category.toUpperCase()}</Text>
        <Text style={[styles.statusBadge, request.status !== "open" && styles.statusClosed]}>
          {request.status}
        </Text>
      </View>

      <Text style={styles.description}>{request.description}</Text>

      {request.address ? (
        <Text style={styles.address}>📍 {request.address}</Text>
      ) : (
        <Text style={styles.address}>
          📍 {request.lat.toFixed(4)}, {request.lng.toFixed(4)}
        </Text>
      )}

      {request.distance_km != null && (
        <Text style={styles.meta}>📏 {request.distance_km.toFixed(1)} km from you</Text>
      )}

      {request.bid_deadline && (
        <Text style={styles.deadline}>
          ⏱ Bidding deadline: {new Date(request.bid_deadline).toLocaleString()}
        </Text>
      )}

      {myLat && myLng && (
        <Text style={styles.meta}>📡 Your position captured for bid</Text>
      )}

      {/* Bid form */}
      {isOpen && !bidSuccess ? (
        <View style={styles.bidForm}>
          <Text style={styles.sectionTitle}>Submit Your Bid</Text>

          <Text style={styles.label}>Your price (USD)</Text>
          <TextInput
            style={styles.input}
            value={priceDollars}
            onChangeText={setPriceDollars}
            placeholder="e.g. 85.00"
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Estimated arrival time (minutes)</Text>
          <TextInput
            style={styles.input}
            value={etaMin}
            onChangeText={setEtaMin}
            placeholder="e.g. 20"
            keyboardType="number-pad"
          />

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder="Describe your approach, experience..."
            multiline
            numberOfLines={3}
          />

          {bidError ? <Text style={styles.errorText}>{bidError}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmitBid}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Bid</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : !isOpen ? (
        <View style={styles.closedNote}>
          <Text style={styles.closedText}>
            This request is no longer accepting bids (status: {request.status}).
          </Text>
        </View>
      ) : null}

      {token && (request.status === "assigned" || request.status === "in_progress") && (
        <ChatPanel token={token} requestId={requestId} accent="#059669" />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  category: {
    fontSize: 13,
    fontWeight: "700",
    color: "#059669",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#059669",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  statusClosed: { color: "#9CA3AF", backgroundColor: "#F3F4F6" },
  description: { fontSize: 16, color: "#111827", marginBottom: 10, lineHeight: 22 },
  address: { fontSize: 13, color: "#6B7280", marginBottom: 6 },
  meta: { fontSize: 13, color: "#6B7280", marginBottom: 4 },
  deadline: { fontSize: 13, color: "#D97706", marginBottom: 12, fontWeight: "500" },
  bidForm: {
    marginTop: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 14, color: "#111827" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    marginBottom: 14,
    backgroundColor: "#F9FAFB",
  },
  noteInput: { height: 80, textAlignVertical: "top" },
  errorText: { color: "#EF4444", textAlign: "center", marginBottom: 8, fontSize: 13 },
  submitBtn: {
    backgroundColor: "#059669",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  closedNote: {
    marginTop: 20,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  closedText: { color: "#6B7280", textAlign: "center", fontSize: 14 },
});
