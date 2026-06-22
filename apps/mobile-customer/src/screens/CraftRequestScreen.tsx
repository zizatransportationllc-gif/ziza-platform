/**
 * CraftRequestScreen — customer posts a professional intervention request.
 * Sprint 47 — Ziza Craft.
 *
 * Customer fills in:
 *   - Category (picker)
 *   - Description (free text)
 *   - Location (GPS auto-fill or manual lat/lng)
 *   - Address (optional)
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

const CAT_LABELS: Record<string, string> = {
  breakdown:   "🔧 Breakdown",
  flat_tyre:   "🔴 Flat Tire",
  tow:         "🚛 Towing",
  fuel:        "⛽ Out of Fuel",
  lockout:     "🔑 Lockout",
  battery:     "🔋 Dead Battery",
  accident:    "🚨 Post-Accident",
  diagnostics: "🔍 Diagnostics",
  other:       "🛠️ Other",
};
import { useAuth } from "../context/AuthContext";

type NavProp = NativeStackNavigationProp<RootStackParamList, "CraftRequest">;

export default function CraftRequestScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation<NavProp>();

  const [category, setCategory] = useState<string>("");
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

  const canSubmit =
    category !== "" &&
    description.trim().length > 0 &&
    lat !== "" &&
    lng !== "";

  const handleSubmit = async () => {
    if (!token || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const req = await createCraftRequest(token, {
        category,
        description: description.trim(),
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        address: address.trim() || null,
        bid_deadline_minutes: parseInt(bidMinutes, 10) || 30,
      });
      Alert.alert(
        "Request Submitted",
        `Your ${category} request has been posted. Professionals can now bid for ${bidMinutes} minutes.`,
        [
          {
            text: "View Requests",
            onPress: () => navigation.replace("MyCraftRequests"),
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
      <Text style={styles.label}>Type of Problem</Text>
      <View style={styles.categories}>
        {CRAFT_CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.catChip, category === cat && styles.catChipSelected]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.catChipText, category === cat && styles.catChipTextSelected]}>
              {CAT_LABELS[cat] ?? cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Description */}
      <Text style={styles.label}>Describe the problem</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Car won't start, clicking noise when turning key..."
        multiline
        numberOfLines={4}
      />

      {/* Location */}
      <Text style={styles.label}>Your location</Text>
      <TouchableOpacity style={styles.gpsBtn} onPress={() => handleGPS(false)} disabled={locating}>
        {locating ? (
          <ActivityIndicator color="#F97316" />
        ) : (
          <Text style={styles.gpsBtnText}>📍 Use my GPS location</Text>
        )}
      </TouchableOpacity>
      <View style={styles.coordRow}>
        <TextInput
          style={[styles.input, styles.coordInput]}
          value={lat}
          onChangeText={setLat}
          placeholder="Latitude"
          keyboardType="decimal-pad"
        />
        <TextInput
          style={[styles.input, styles.coordInput]}
          value={lng}
          onChangeText={setLng}
          placeholder="Longitude"
          keyboardType="decimal-pad"
        />
      </View>

      {/* Address (optional) */}
      <Text style={styles.label}>Address (optional)</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="e.g. 123 Main St, Newark NJ"
      />

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
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  catChipSelected: { backgroundColor: "#FFF7ED", borderColor: "#F97316" },
  catChipText: { fontSize: 13, color: "#374151" },
  catChipTextSelected: { color: "#F97316", fontWeight: "600" },
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
  gpsBtn: {
    backgroundColor: "#FFF7ED",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  gpsBtnText: { color: "#F97316", fontWeight: "600", fontSize: 14 },
  coordRow: { flexDirection: "row", gap: 8 },
  coordInput: { flex: 1 },
  errorText: { color: "#EF4444", textAlign: "center", marginBottom: 8, fontSize: 13 },
  submitBtn: {
    backgroundColor: "#F97316",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
