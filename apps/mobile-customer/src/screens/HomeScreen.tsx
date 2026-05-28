/**
 * HomeScreen — trip booking: origin + destination picker, estimate, confirm.
 * Sprint 43 — address search + GPS for pickup; address search for drop-off.
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

  useEffect(() => {
    if (!token) return;
    listCategories(token).then(setCategories).catch(() => {});
  }, [token]);

  // ── GPS: auto-detect origin ────────────────────────────────────────────────
  const handleGPS = async () => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location required",
          "Please enable location access in your device settings.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      setOrigin({
        lat: latitude,
        lng: longitude,
        name: `My location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
      });
      setEstimate(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Open address search screen ─────────────────────────────────────────────
  const openSearch = (role: "origin" | "destination") => {
    navigation.navigate("Places", {
      onSelect: (place: { lat: number; lng: number; name: string }) => {
        if (role === "origin") {
          setOrigin(place);
        } else {
          setDestination(place);
        }
        setEstimate(null);
      },
    });
  };

  // ── Estimate ───────────────────────────────────────────────────────────────
  const handleEstimate = async () => {
    if (!token || !origin || !destination) return;
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
      const trip = await createTrip(token, estimate.estimate_id);
      navigation.navigate("Tracking", { tripId: trip.trip_id });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const canEstimate = !!origin && !!destination && !loading;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Book a Ride</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* ── Pickup location ───────────────────────────────── */}
      <View style={styles.locationCard}>
        <Text style={styles.locationLabel}>📍 Pickup</Text>
        <View style={styles.locationActions}>
          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={handleGPS}
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
          <View style={styles.locationChip}>
            <Text style={styles.locationChipText} numberOfLines={2}>{origin.name}</Text>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => { setOrigin(null); setEstimate(null); }}
            >
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          </View>
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
          <View style={styles.locationChip}>
            <Text style={styles.locationChipText} numberOfLines={2}>{destination.name}</Text>
            <TouchableOpacity
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={() => { setDestination(null); setEstimate(null); }}
            >
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          </View>
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
          {!origin && !destination
            ? "Set pickup and drop-off to estimate your fare."
            : !origin
            ? "Set your pickup location."
            : "Set your drop-off location."}
        </Text>
      )}

      {estimate && (
        <View style={styles.estimateBox}>
          <Text style={styles.price}>{formatUSD(estimate.price_xof)}</Text>
          <Text style={styles.detail}>
            {estimate.distance_km} km · ~{estimate.duration_min} min
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
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 12 },
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
  locationChipText: { flex: 1, fontSize: 13, color: "#166534", fontWeight: "500" },
  clearBtn: { color: "#9CA3AF", fontSize: 14, paddingLeft: 8 },

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
});
