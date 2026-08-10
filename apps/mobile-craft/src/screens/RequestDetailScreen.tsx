/**
 * RequestDetailScreen — shows a craft request and a bid submission form.
 * Sprint 47 — Ziza Craft.
 *
 * Professional can see:
 *   - Category, description, address, bidding deadline
 *   - A form to submit their bid (price in USD, ETA in minutes, optional note)
 *   - Their GPS position is captured at bid time for distance calculation
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import {
  getCraftRequest,
  submitBid,
  craftMarkArrived,
  craftWorkDone,
  reverseGeocode,
  listCraftPhotos,
  uploadCraftPhoto,
  updateProfessionalProfile,
  CraftRequest,
  CraftPhoto,
  formatUSD,
} from "../api";
import { useAuth } from "../context/AuthContext";
import ChatPanel from "../components/ChatPanel";
import NavigationView from "../components/NavigationView";

type RouteProps = RouteProp<RootStackParamList, "RequestDetail">;
type NavProp = NativeStackNavigationProp<RootStackParamList, "RequestDetail">;

// Distances are stored in km; display in miles (US). 1 mi = 1.609344 km.
const fmtMiles = (km: number): string => (km / 1.609344).toFixed(1);

export default function RequestDetailScreen(): React.ReactElement {
  const { token } = useAuth();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProp>();
  const { requestId, canManage = false } = route.params;

  const [request, setRequest] = useState<CraftRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bid form
  const [priceDollars, setPriceDollars] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidSuccess, setBidSuccess] = useState(false);

  // My GPS position for distance data. The backend computes the bid's ETA
  // from this position, so it's required to submit a bid — not just a
  // nice-to-have — and a failure here must be surfaced, not swallowed.
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);
  const [myAddr, setMyAddr] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<"loading" | "ready" | "error">("loading");
  const [locationErrorMsg, setLocationErrorMsg] = useState<string | null>(null);

  const captureLocation = useCallback(async () => {
    if (!token) return;
    setLocationStatus("loading");
    setLocationErrorMsg(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationStatus("error");
        setLocationErrorMsg("Location permission is required to submit a bid (used to calculate your ETA).");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setMyLat(loc.coords.latitude);
      setMyLng(loc.coords.longitude);
      setLocationStatus("ready");
      reverseGeocode(token, loc.coords.latitude, loc.coords.longitude)
        .then((r) => { if (r?.name) setMyAddr(r.name); })
        .catch(() => {});
    } catch {
      setLocationStatus("error");
      setLocationErrorMsg("Couldn't get your location. Check that GPS is enabled and try again.");
    }
  }, [token]);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        const posPromise = captureLocation();
        const req = await getCraftRequest(token, requestId);
        setRequest(req);
        await posPromise;
      } catch (e: any) {
        setError(e.message || "Failed to load request");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, requestId]);

  // Poll the status so the pro sees customer-side transitions (e.g. the customer
  // confirming arrival → in_progress) without a manual refresh. Stops at
  // terminal states.
  useEffect(() => {
    if (!token) return;
    const status = request?.status;
    if (!status || ["completed", "cancelled"].includes(status)) return;
    const iv = setInterval(() => {
      getCraftRequest(token, requestId).then(setRequest).catch(() => {});
    }, 6000);
    return () => clearInterval(iv);
  }, [token, requestId, request?.status]);

  const handleSubmitBid = async () => {
    setBidError(null);
    const priceNum = parseFloat(priceDollars);
    if (isNaN(priceNum) || priceNum <= 0) {
      setBidError("Enter a valid price (e.g. 85.00)");
      return;
    }
    if (myLat == null || myLng == null) {
      setBidError(locationErrorMsg || "Your location is required to submit a bid. Tap Retry above and allow location access.");
      return;
    }
    setSubmitting(true);
    try {
      // ETA is computed by the system from the captured GPS position.
      await submitBid(token!, requestId, {
        price_cents: Math.round(priceNum * 100),
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

  const [actionBusy, setActionBusy] = useState(false);
  const runAction = async (fn: (t: string, id: string) => Promise<CraftRequest>) => {
    if (!token) return;
    setActionBusy(true);
    try {
      setRequest(await fn(token, requestId));
    } catch (e: any) {
      Alert.alert("Error", e.message || "Action failed");
    } finally {
      setActionBusy(false);
    }
  };

  // Before/after photos
  const [photos, setPhotos] = useState<CraftPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const loadPhotos = () => {
    if (token) listCraftPhotos(token, requestId).then(setPhotos).catch(() => {});
  };
  useEffect(() => {
    if (request && ["assigned", "arrived", "in_progress", "pro_done", "completed"].includes(request.status)) {
      loadPhotos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.status]);

  // Publish the pro's live position to the backend so the customer can track
  // them (throttled to ~10s to spare the network / battery).
  const lastPushRef = useRef(0);
  const publishPosition = useCallback((lat: number, lng: number) => {
    if (!token) return;
    const now = Date.now();
    if (now - lastPushRef.current < 10000) return;
    lastPushRef.current = now;
    updateProfessionalProfile(token, { current_lat: lat, current_lng: lng }).catch(() => {});
  }, [token]);

  const addPhoto = async (kind: "before" | "after") => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]) return;
    setPhotoBusy(kind);
    try {
      await uploadCraftPhoto(token!, requestId, kind, result.assets[0].uri, result.assets[0].mimeType || "image/jpeg");
      loadPhotos();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Upload failed");
    } finally {
      setPhotoBusy(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
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
        <Text style={styles.meta}>📏 {fmtMiles(request.distance_km)} mi from you</Text>
      )}

      {request.bid_deadline && (
        <Text style={styles.deadline}>
          ⏱ Bidding deadline: {new Date(request.bid_deadline).toLocaleString()}
        </Text>
      )}

      {myLat && myLng && (
        <Text style={styles.meta}>📡 Your position: {myAddr ?? "captured for bid"}</Text>
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

          <Text style={styles.meta}>⏱ ETA is calculated automatically from your GPS position.</Text>

          {locationStatus === "loading" && (
            <View style={styles.locationNotice}>
              <ActivityIndicator size="small" color="#1D4ED8" />
              <Text style={styles.locationNoticeText}>Getting your location…</Text>
            </View>
          )}
          {locationStatus === "error" && (
            <View style={styles.locationNotice}>
              <Text style={[styles.locationNoticeText, styles.locationNoticeError]}>
                ⚠️ {locationErrorMsg}
              </Text>
              <TouchableOpacity onPress={captureLocation}>
                <Text style={styles.locationRetry}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

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
            style={[styles.submitBtn, (submitting || locationStatus !== "ready") && styles.submitBtnDisabled]}
            onPress={handleSubmitBid}
            disabled={submitting || locationStatus !== "ready"}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Bid</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Verification code once assigned (winning pro only) */}
      {canManage &&
        ["assigned", "arrived", "in_progress", "pro_done", "completed"].includes(request.status) &&
        request.verification_code && (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>🔐 VERIFICATION CODE</Text>
            <Text style={styles.codeValue}>{request.verification_code}</Text>
            <Text style={styles.codeHint}>Confirm this with the customer on site.</Text>
          </View>
        )}

      {/* Before/after photos (winning pro only) */}
      {canManage && ["assigned", "arrived", "in_progress", "pro_done", "completed"].includes(request.status) && (
        <View style={styles.photoSection}>
          <Text style={styles.sectionTitle}>📷 Before / After photos</Text>
          {(["before", "after"] as const).map((k) => {
            const items = photos.filter((p) => p.kind === k);
            const canUpload = ["assigned", "arrived", "in_progress"].includes(request.status);
            return (
              <View key={k} style={styles.photoGroup}>
                <View style={styles.photoHead}>
                  <Text style={styles.photoKind}>{k === "before" ? "Before" : "After"}</Text>
                  {canUpload && (
                    <TouchableOpacity onPress={() => addPhoto(k)} disabled={photoBusy !== null}>
                      <Text style={styles.photoAdd}>{photoBusy === k ? "Uploading…" : "+ Add"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {items.map((p) => (p.url ? <Image key={p.photo_id} source={{ uri: p.url }} style={styles.photoThumb} /> : null))}
                  {items.length === 0 && <Text style={styles.photoEmpty}>No photos yet</Text>}
                </ScrollView>
              </View>
            );
          })}
        </View>
      )}

      {/* In-app navigation window — follows the pro to the customer (winning pro only) */}
      {canManage && ["assigned", "arrived", "in_progress"].includes(request.status) && (
        <View style={styles.navWrap}>
          <NavigationView targetLat={request.lat} targetLng={request.lng} label="Customer" onPosition={publishPosition} />
          {/* Optional external navigation — opens a maps app; the in-app window stays here. */}
          <TouchableOpacity
            style={styles.navBtnSecondary}
            onPress={() =>
              Linking.openURL(
                `https://www.google.com/maps/dir/?api=1&destination=${request.lat},${request.lng}&travelmode=driving`
              ).catch(() => {})
            }
          >
            <Text style={styles.navBtnSecondaryText}>🧭 Open in external maps</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pro lifecycle actions (winning pro only) */}
      {canManage && request.status === "assigned" && (
        <TouchableOpacity style={[styles.submitBtn, actionBusy && styles.submitBtnDisabled]} onPress={() => runAction(craftMarkArrived)} disabled={actionBusy}>
          <Text style={styles.submitBtnText}>📍 I've arrived at the customer</Text>
        </TouchableOpacity>
      )}
      {canManage && request.status === "arrived" && (
        <View style={styles.closedNote}><Text style={styles.closedText}>⏳ Waiting for the customer to confirm your arrival…</Text></View>
      )}
      {canManage && request.status === "in_progress" && (
        <TouchableOpacity style={[styles.submitBtn, actionBusy && styles.submitBtnDisabled]} onPress={() => runAction(craftWorkDone)} disabled={actionBusy}>
          <Text style={styles.submitBtnText}>🔧 Mark work as done</Text>
        </TouchableOpacity>
      )}
      {canManage && request.status === "pro_done" && (
        <View style={styles.closedNote}><Text style={styles.closedText}>⏳ Waiting for the customer to confirm completion…</Text></View>
      )}
      {canManage && request.status === "completed" && (
        <View style={styles.closedNote}><Text style={styles.closedText}>🎉 Job completed.</Text></View>
      )}

      {token && canManage && ["assigned", "arrived", "in_progress", "pro_done"].includes(request.status) && (
        <ChatPanel token={token} requestId={requestId} accent="#1D4ED8" />
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
    color: "#1D4ED8",
    backgroundColor: "#EEF3FE",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1D4ED8",
    backgroundColor: "#DCE7FB",
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
  locationNotice: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 8,
  },
  locationNoticeText: { fontSize: 13, color: "#6B7280", flexShrink: 1 },
  locationNoticeError: { color: "#D97706" },
  locationRetry: { fontSize: 13, fontWeight: "700", color: "#1D4ED8" },
  errorText: { color: "#EF4444", textAlign: "center", marginBottom: 8, fontSize: 13 },
  submitBtn: {
    backgroundColor: "#1D4ED8",
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
  codeCard: {
    marginTop: 20,
    backgroundColor: "#EEF3FE",
    borderWidth: 1,
    borderColor: "#C7D7F7",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  codeLabel: { fontSize: 12, color: "#1E40AF", fontWeight: "600" },
  codeValue: { fontSize: 28, fontWeight: "800", letterSpacing: 6, color: "#1D4ED8", marginVertical: 4 },
  codeHint: { fontSize: 12, color: "#6B7280" },
  navBtn: { marginTop: 16, backgroundColor: "#1D4ED8", borderRadius: 10, padding: 16, alignItems: "center" },
  navBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  navWrap: { marginTop: 16 },
  navBtnSecondary: { marginTop: 10, backgroundColor: "transparent", borderRadius: 10, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#1D4ED8" },
  navBtnSecondaryText: { color: "#1D4ED8", fontWeight: "600", fontSize: 15 },
  photoSection: { marginTop: 16 },
  photoGroup: { marginTop: 8 },
  photoHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  photoKind: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  photoAdd: { fontSize: 13, fontWeight: "700", color: "#1D4ED8" },
  photoThumb: { width: 84, height: 84, borderRadius: 8, marginRight: 8, backgroundColor: "#E5E7EB" },
  photoEmpty: { fontSize: 12, color: "#9CA3AF" },
});
