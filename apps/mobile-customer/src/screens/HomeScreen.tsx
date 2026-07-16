/**
 * HomeScreen — trip booking: origin + destination picker, estimate, confirm.
 * Sprint 43 — address search + GPS for pickup; address search for drop-off.
 * Sprint 45 — zone coverage check after each location selection.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  listCategories,
  getEstimate,
  createTrip,
  checkPointInService,
  reverseGeocode,
  CategoryInfo,
  EstimateResponse,
} from "../api";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/AppNavigator";
import CategoryPicker from "../components/CategoryPicker";
import PromoInput from "../components/PromoInput";

type HomeNavProp = NativeStackNavigationProp<RootStackParamList, "Home">;

interface LocationPoint {
  lat: number;
  lng: number;
  name: string;
}

function formatUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (n ?? 0) / 100,
  );
}

// Distances are stored in km; display in miles (US). 1 mi = 1.609344 km.
const fmtMiles = (km: number): string => (km / 1.609344).toFixed(1);

export default function HomeScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation<HomeNavProp>();
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<LocationPoint | null>(null);
  const [destination, setDestination] = useState<LocationPoint | null>(null);

  // Sprint 45: zone coverage — null=unchecked, true=ok, false=outside zone
  const [originInZone, setOriginInZone] = useState<boolean | null>(null);
  const [destInZone, setDestInZone]     = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    listCategories(token).then(setCategories).catch(() => {});
  }, [token]);

  // Sprint 45: async zone check helper
  const checkZone = async (point: LocationPoint | null): Promise<boolean | null> => {
    if (!point) return null;
    const result = await checkPointInService(point.lat, point.lng);
    return result.in_service;
  };

  // ── GPS: auto-detect origin ────────────────────────────────────────────────
  const handleGPS = async (silent = false) => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!silent) {
          Alert.alert(
            "Location required",
            "Please enable location access in your device settings.",
          );
        }
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      // Reverse-geocode to a real street address so the driver sees the same
      // pickup label (fall back to coordinates if it can't be resolved).
      const resolved = token ? await reverseGeocode(token, latitude, longitude) : null;
      const place: LocationPoint = {
        lat: latitude,
        lng: longitude,
        name: resolved?.name || `My location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
      };
      setOrigin(place);
      setEstimate(null);
      // Sprint 45: zone check
      const inZone = await checkZone(place);
      setOriginInZone(inZone);
    } catch (e: any) {
      if (!silent) setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-detect the pickup from GPS on first load (silent; user can change it).
  useEffect(() => {
    if (!origin) handleGPS(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Open address search screen ─────────────────────────────────────────────
  const openSearch = (role: "origin" | "destination") => {
    navigation.navigate("Places", {
      onSelect: async (place: { lat: number; lng: number; name: string }) => {
        if (role === "origin") {
          setOrigin(place);
          setOriginInZone(null);
          const inZone = await checkZone(place);
          setOriginInZone(inZone);
        } else {
          setDestination(place);
          setDestInZone(null);
          const inZone = await checkZone(place);
          setDestInZone(inZone);
        }
        setEstimate(null);
      },
    });
  };

  // ── Estimate ───────────────────────────────────────────────────────────────
  const handleEstimate = async () => {
    if (!token || !origin || !destination) return;

    // Sprint 45: block if outside zone
    if (originInZone === false || destInZone === false) {
      Alert.alert(
        "Outside service area",
        "One or more locations are outside our service area. Please choose addresses within a covered zone.",
      );
      return;
    }

    setLoading(true);
    setError(null);
    setEstimate(null);
    try {
      const est = await getEstimate(
        token,
        origin.lat,
        origin.lng,
        destination.lat,
        destination.lng,
        selectedCategory,
      );
      setEstimate(est);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Book ───────────────────────────────────────────────────────────────────
  const handleBook = async () => {
    if (!token || !estimate) return;
    setLoading(true);
    try {
      const trip = await createTrip(token, estimate.estimate_id, {
        originAddress: origin?.name ?? null,
        destAddress: destination?.name ?? null,
      });
      navigation.navigate("Tracking", { tripId: trip.trip_id });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const canEstimate =
    !!origin && !!destination && !loading &&
    originInZone !== false && destInZone !== false;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.heading}>Book a Ride</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={styles.walletBtn}
            onPress={() => navigation.navigate("PaymentMethods")}
          >
            <Text style={styles.walletBtnText}>💳 Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.walletBtn}
            onPress={() => navigation.navigate("Wallet")}
          >
            <Text style={styles.walletBtnText}>💰 Wallet</Text>
          </TouchableOpacity>
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Sprint 47 — Ziza Craft entry point */}
      <View style={styles.craftCard}>
        <Text style={styles.craftTitle}>🔧 Assistance — Roadside Help</Text>
        <Text style={styles.craftSubtitle}>
          Breakdown, flat tire, towing, lockout, battery…
          Post your situation and professionals bid to assist you.
        </Text>
        <View style={styles.craftButtons}>
          <TouchableOpacity
            style={styles.craftBtn}
            onPress={() => navigation.navigate("CraftRequest")}
          >
            <Text style={styles.craftBtnText}>+ Post a Request</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.craftBtn, styles.craftBtnOutline]}
            onPress={() => navigation.navigate("MyCraftRequests")}
          >
            <Text style={[styles.craftBtnText, styles.craftBtnTextOutline]}>My Requests</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Pickup location ───────────────────────────────── */}
      <View style={styles.locationCard}>
        <Text style={styles.locationLabel}>📍 Pickup</Text>
        <View style={styles.locationActions}>
          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={() => handleGPS(false)}
            disabled={loading}
          >
            <Text style={styles.gpsBtnText}>📡 GPS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => openSearch("origin")}
          >
            <Text style={styles.searchBtnText}>Search address…</Text>
          </TouchableOpacity>
        </View>
        {origin && (
          <View style={[styles.locationChip, originInZone === false && styles.locationChipWarning]}>
            <Text style={[styles.locationChipText, originInZone === false && styles.locationChipTextWarning]} numberOfLines={2}>
              {origin.name}
            </Text>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => { setOrigin(null); setOriginInZone(null); setEstimate(null); }}
            >
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Sprint 45: zone warning */}
        {originInZone === false && (
          <Text style={styles.zoneWarning}>⚠️ This pickup is outside our service area.</Text>
        )}
      </View>

      {/* ── Drop-off location ─────────────────────────────── */}
      <View style={styles.locationCard}>
        <Text style={styles.locationLabel}>🏁 Drop-off</Text>
        <TouchableOpacity
          style={[styles.searchBtn, { alignSelf: "flex-start" }]}
          onPress={() => openSearch("destination")}
        >
          <Text style={styles.searchBtnText}>Search address…</Text>
        </TouchableOpacity>
        {destination && (
          <View style={[styles.locationChip, destInZone === false && styles.locationChipWarning]}>
            <Text style={[styles.locationChipText, destInZone === false && styles.locationChipTextWarning]} numberOfLines={2}>
              {destination.name}
            </Text>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => { setDestination(null); setDestInZone(null); setEstimate(null); }}
            >
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Sprint 45: zone warning */}
        {destInZone === false && (
          <Text style={styles.zoneWarning}>⚠️ This drop-off is outside our service area.</Text>
        )}
      </View>

      <CategoryPicker
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      <TouchableOpacity
        style={[styles.button, !canEstimate && styles.buttonDisabled]}
        onPress={handleEstimate}
        disabled={!canEstimate}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Get Fare Estimate</Text>
        )}
      </TouchableOpacity>

      {!canEstimate && !loading && (
        <Text style={styles.hintText}>
          {originInZone === false || destInZone === false
            ? "Please choose locations within our service area."
            : !origin && !destination
            ? "Set pickup and drop-off to estimate your fare."
            : !origin
            ? "Set your pickup location."
            : "Set your drop-off location."}
        </Text>
      )}

      {estimate && (
        <View style={styles.estimateBox}>
          <Text style={styles.price}>{formatUSD(estimate.price_cents)}</Text>
          <Text style={styles.detail}>
            {fmtMiles(estimate.distance_km)} mi · ~{estimate.duration_min} min
          </Text>
          <PromoInput token={token!} estimateId={estimate.estimate_id} />
          <TouchableOpacity
            style={[styles.button, styles.confirmButton]}
            onPress={handleBook}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Confirm Booking</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  heading: { fontSize: 22, fontWeight: "bold" },
  walletBtn: {
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  walletBtnText: { color: "#C2410C", fontWeight: "700", fontSize: 13 },
  error: { color: "#EF4444", marginBottom: 8, fontSize: 13 },
  hintText: { textAlign: "center", color: "#9CA3AF", fontSize: 12, marginTop: 4 },

  locationCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  locationLabel: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 8 },
  locationActions: { flexDirection: "row", gap: 8 },
  gpsBtn: {
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  gpsBtnText: { fontSize: 13, fontWeight: "600", color: "#1D4ED8" },
  searchBtn: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchBtnText: { fontSize: 13, color: "#9CA3AF" },
  locationChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  locationChipWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
  },
  locationChipText: { flex: 1, fontSize: 13, color: "#166534", fontWeight: "500" },
  locationChipTextWarning: { color: "#92400E" },
  clearBtn: { color: "#9CA3AF", fontSize: 14, paddingLeft: 8 },
  zoneWarning: {
    fontSize: 12,
    color: "#B45309",
    marginTop: 6,
  },

  button: {
    backgroundColor: "#F97316",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginVertical: 8,
  },
  buttonDisabled: { backgroundColor: "#D1D5DB" },
  confirmButton: { backgroundColor: "#16A34A" },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  estimateBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
  },
  price: { fontSize: 28, fontWeight: "bold", color: "#F97316", textAlign: "center" },
  detail: { textAlign: "center", color: "#6B7280", marginBottom: 12 },

  // Sprint 47 — Ziza Craft
  craftCard: {
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  craftTitle: { fontSize: 16, fontWeight: "700", color: "#059669", marginBottom: 4 },
  craftSubtitle: { fontSize: 13, color: "#374151", marginBottom: 12 },
  craftButtons: { flexDirection: "row", gap: 8 },
  craftBtn: {
    flex: 1,
    backgroundColor: "#059669",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  craftBtnOutline: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#059669" },
  craftBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  craftBtnTextOutline: { color: "#059669" },
});
