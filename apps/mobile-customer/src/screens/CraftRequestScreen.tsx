/**
 * CraftRequestScreen — customer posts a professional intervention request.
 * Sprint 47 — Ziza Craft.
 *
 * Customer fills in:
 *   - Category (picker)
 *   - Description (free text)
 *   - Location: either search an address (Mapbox) or use GPS — no manual
 *     coordinates; lat/lng are resolved from whichever the customer picks.
 *   - Bidding window duration (default 30 min)
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
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { createCraftRequest, reverseGeocode, CRAFT_CATEGORIES } from "../api";
import Icon from "../components/Icon";

const CAT_LABELS: Record<string, string> = {
  breakdown:   "Breakdown",
  flat_tyre:   "Flat Tire",
  tow:         "Towing",
  fuel:        "Out of Fuel",
  lockout:     "Lockout",
  battery:     "Dead Battery",
  accident:    "Post-Accident",
  diagnostics: "Diagnostics",
  other:       "Other",
};
const CAT_ICON: Record<string, string> = {
  breakdown: "assistance", flat_tyre: "tire", tow: "tow", fuel: "fuel",
  lockout: "lock", battery: "battery", accident: "alert",
  diagnostics: "search", other: "assistance",
};
// One optional quick question per service type — a couple of chips that help
// the pro quote accurately. The answer is prefixed to the description sent.
const SERVICE_Q: Record<string, { q: string; opts: string[] }> = {
  breakdown: { q: "Engine", opts: ["Won't start", "Starts then stalls"] },
  flat_tyre: { q: "Spare tire", opts: ["Have a spare", "No spare"] },
  tow:       { q: "Vehicle", opts: ["Still rolls", "Wheels locked"] },
  fuel:      { q: "Fuel type", opts: ["Gas", "Diesel"] },
  lockout:   { q: "Keys", opts: ["Locked inside", "Lost"] },
  battery:   { q: "Need", opts: ["Jump start", "Replacement"] },
};
import { useAuth } from "../context/AuthContext";

type NavProp = NativeStackNavigationProp<RootStackParamList, "CraftRequest">;

export default function CraftRequestScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation<NavProp>();

  const [category, setCategory] = useState<string>("");
  const [serviceAnswer, setServiceAnswer] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const [bidMinutes, setBidMinutes] = useState("30");
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGPS = async (silent = false) => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!silent) Alert.alert("Permission denied", "Location permission is required.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(loc.coords.latitude.toFixed(5));
      setLng(loc.coords.longitude.toFixed(5));
      // Auto-fill the address from the GPS position.
      if (token) {
        const r = await reverseGeocode(token, loc.coords.latitude, loc.coords.longitude);
        if (r?.name) setAddress((prev) => (silent ? prev || r.name! : r.name!));
      }
    } catch (e: any) {
      if (!silent) Alert.alert("Error", e.message || "Failed to get location");
    } finally {
      setLocating(false);
    }
  };

  // Auto-detect location + address on first load (silent).
  useEffect(() => {
    if (!lat) handleGPS(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open the Mapbox address search (same picker as the ride flow). Selecting a
  // result fills the address AND the coordinates, so the pro knows where to go.
  const openSearch = () => {
    navigation.navigate("Places", {
      onSelect: (place: { lat: number; lng: number; name: string }) => {
        setLat(place.lat.toFixed(5));
        setLng(place.lng.toFixed(5));
        setAddress(place.name);
      },
    });
  };

  const canSubmit =
    category !== "" &&
    description.trim().length > 0 &&
    lat !== "" &&
    lng !== "";

  const handleSubmit = async () => {
    if (!token || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    // Prefix the quick-question answer so the pro sees it in the description.
    const svcQ = SERVICE_Q[category];
    const fullDescription = svcQ && serviceAnswer
      ? `${svcQ.q}: ${serviceAnswer}\n${description.trim()}`.trim()
      : description.trim();
    try {
      const req = await createCraftRequest(token, {
        category,
        description: fullDescription,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        address: address.trim() || null,
        bid_deadline_minutes: parseInt(bidMinutes, 10) || 30,
      });
      // Reset the form so returning to the Assistance tab shows a clean one.
      setCategory("");
      setServiceAnswer(null);
      setDescription("");
      Alert.alert(
        "Request Submitted",
        `Your ${category} request has been posted. Professionals can now bid for ${bidMinutes} minutes.`,
        [
          {
            text: "Track bids",
            onPress: () =>
              navigation.navigate("Bids", {
                requestId: req.request_id,
                customerLat: req.lat,
                customerLng: req.lng,
              }),
          },
        ]
      );
    } catch (e: any) {
      setError(e.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Request Roadside Help</Text>
      <Text style={styles.subtitle}>Roadside assistance</Text>

      {/* Category picker */}
      <Text style={styles.label}>Type of Issue</Text>
      <View style={styles.categories}>
        {CRAFT_CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.catChip, category === cat && styles.catChipSelected]}
            onPress={() => { setCategory(cat); setServiceAnswer(null); }}
          >
            <Icon name={CAT_ICON[cat] ?? "assistance"} size={15} color={category === cat ? "#1D4ED8" : "#374151"} />
            <Text style={[styles.catChipText, category === cat && styles.catChipTextSelected]}>
              {CAT_LABELS[cat] ?? cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Optional quick question for this service type */}
      {SERVICE_Q[category] && (
        <>
          <Text style={styles.label}>{SERVICE_Q[category].q}</Text>
          <View style={styles.categories}>
            {SERVICE_Q[category].opts.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.catChip, serviceAnswer === opt && styles.catChipSelected]}
                onPress={() => setServiceAnswer(serviceAnswer === opt ? null : opt)}
              >
                <Text style={[styles.catChipText, serviceAnswer === opt && styles.catChipTextSelected]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Description */}
      <Text style={styles.label}>Describe the issue</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Car won't start, clicking noise when turning key..."
        multiline
        numberOfLines={4}
      />

      {/* Location — enter an address (Mapbox search) or use GPS. No manual
          coordinates: lat/lng are resolved behind the scenes from either. */}
      <Text style={styles.label}>Your location</Text>
      <TouchableOpacity style={styles.addressField} onPress={openSearch}>
        <Text
          style={address ? styles.addressText : styles.addressPlaceholder}
          numberOfLines={2}
        >
          {address || "Search your address…"}
        </Text>
        <Text style={styles.addressSearchIcon}>🔍</Text>
      </TouchableOpacity>
      <Text style={styles.orDivider}>or</Text>
      <TouchableOpacity style={styles.gpsBtn} onPress={() => handleGPS(false)} disabled={locating}>
        {locating ? (
          <ActivityIndicator color="#1D4ED8" />
        ) : (
          <Text style={styles.gpsBtnText}>📍 Use my GPS location</Text>
        )}
      </TouchableOpacity>

      {/* Bidding window */}
      <Text style={styles.label}>Bidding window (minutes)</Text>
      <TextInput
        style={styles.input}
        value={bidMinutes}
        onChangeText={setBidMinutes}
        placeholder="30"
        keyboardType="number-pad"
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit || submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>Post Request</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "bold", color: "#111827", marginBottom: 2 },
  subtitle: { fontSize: 13, color: "#9CA3AF", marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  catChipSelected: { backgroundColor: "#EEF3FE", borderColor: "#1D4ED8" },
  catChipText: { fontSize: 13, color: "#374151" },
  catChipTextSelected: { color: "#1D4ED8", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    marginBottom: 14,
    backgroundColor: "#F9FAFB",
  },
  multiline: { height: 100, textAlignVertical: "top" },
  addressField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    minHeight: 48,
    backgroundColor: "#F9FAFB",
    marginBottom: 6,
  },
  addressText: { flex: 1, fontSize: 15, color: "#111", marginRight: 8 },
  addressPlaceholder: { flex: 1, fontSize: 15, color: "#9CA3AF", marginRight: 8 },
  addressSearchIcon: { fontSize: 16 },
  orDivider: { textAlign: "center", color: "#9CA3AF", fontSize: 12, marginBottom: 6 },
  gpsBtn: {
    backgroundColor: "#EEF3FE",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#C7D7F7",
  },
  gpsBtnText: { color: "#1D4ED8", fontWeight: "600", fontSize: 14 },
  errorText: { color: "#EF4444", textAlign: "center", marginBottom: 8, fontSize: 13 },
  submitBtn: {
    backgroundColor: "#1D4ED8",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
