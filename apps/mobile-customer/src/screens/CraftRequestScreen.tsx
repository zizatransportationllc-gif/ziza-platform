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
import { useAuth } from "../context/AuthContext";
import { useI18n, translations } from "../i18n";

const CAT_ICON: Record<string, string> = {
  breakdown: "assistance", flat_tyre: "tire", tow: "tow", fuel: "fuel",
  lockout: "lock", battery: "battery", accident: "alert",
  diagnostics: "search", other: "assistance",
};
// Category label — translated via i18n key `assistance.category.<code>`.
function categoryLabel(cat: string, t: (key: string) => string): string {
  return (CRAFT_CATEGORIES as readonly string[]).includes(cat) ? t(`assistance.category.${cat}`) : cat;
}
// One optional quick question per service type — a couple of chips that help
// the pro quote accurately. The answer is prefixed to the description sent.
// Values are i18n keys, not raw text — see `assistance.serviceQ.*` in i18n.tsx.
// The description prefix sent to the backend always uses the ENGLISH copy
// (via `translations.en`), regardless of display language — it's read by the
// professional in a separate, not-yet-translated app.
const SERVICE_Q: Record<string, { qKey: string; optKeys: string[] }> = {
  breakdown: { qKey: "assistance.serviceQ.breakdown.q", optKeys: ["assistance.serviceQ.breakdown.opt1", "assistance.serviceQ.breakdown.opt2"] },
  flat_tyre: { qKey: "assistance.serviceQ.flat_tyre.q", optKeys: ["assistance.serviceQ.flat_tyre.opt1", "assistance.serviceQ.flat_tyre.opt2"] },
  tow:       { qKey: "assistance.serviceQ.tow.q", optKeys: ["assistance.serviceQ.tow.opt1", "assistance.serviceQ.tow.opt2"] },
  fuel:      { qKey: "assistance.serviceQ.fuel.q", optKeys: ["assistance.serviceQ.fuel.opt1", "assistance.serviceQ.fuel.opt2"] },
  lockout:   { qKey: "assistance.serviceQ.lockout.q", optKeys: ["assistance.serviceQ.lockout.opt1", "assistance.serviceQ.lockout.opt2"] },
  battery:   { qKey: "assistance.serviceQ.battery.q", optKeys: ["assistance.serviceQ.battery.opt1", "assistance.serviceQ.battery.opt2"] },
};

type NavProp = NativeStackNavigationProp<RootStackParamList, "CraftRequest">;

export default function CraftRequestScreen(): React.ReactElement {
  const { token } = useAuth();
  const { t } = useI18n();
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
        if (!silent) Alert.alert(t("assistance.form.permissionDeniedTitle"), t("assistance.form.permissionDeniedBody"));
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
      if (!silent) Alert.alert(t("login.errorTitle"), e.message || t("assistance.form.errorGetLocation"));
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
    // Always in English (translations.en), regardless of display language —
    // the pro app isn't translated, this text is read by a person, not parsed.
    const svcQ = SERVICE_Q[category];
    const fullDescription = svcQ && serviceAnswer
      ? `${translations.en[svcQ.qKey]}: ${translations.en[serviceAnswer]}\n${description.trim()}`.trim()
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
        t("assistance.form.requestSubmittedTitle"),
        t("assistance.form.requestSubmittedBody", { category: categoryLabel(category, t), minutes: bidMinutes }),
        [
          {
            text: t("assistance.form.trackBids"),
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
      setError(e.message || t("assistance.form.errorSubmit"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t("assistance.form.title")}</Text>
      <Text style={styles.subtitle}>{t("assistance.form.subtitle")}</Text>

      {/* Category picker */}
      <Text style={styles.label}>{t("assistance.form.typeOfIssue")}</Text>
      <View style={styles.categories}>
        {CRAFT_CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.catChip, category === cat && styles.catChipSelected]}
            onPress={() => { setCategory(cat); setServiceAnswer(null); }}
          >
            <Icon name={CAT_ICON[cat] ?? "assistance"} size={15} color={category === cat ? "#1D4ED8" : "#374151"} />
            <Text style={[styles.catChipText, category === cat && styles.catChipTextSelected]}>
              {categoryLabel(cat, t)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Optional quick question for this service type */}
      {SERVICE_Q[category] && (
        <>
          <Text style={styles.label}>{t(SERVICE_Q[category].qKey)}</Text>
          <View style={styles.categories}>
            {SERVICE_Q[category].optKeys.map((optKey) => (
              <TouchableOpacity
                key={optKey}
                style={[styles.catChip, serviceAnswer === optKey && styles.catChipSelected]}
                onPress={() => setServiceAnswer(serviceAnswer === optKey ? null : optKey)}
              >
                <Text style={[styles.catChipText, serviceAnswer === optKey && styles.catChipTextSelected]}>
                  {t(optKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Description */}
      <Text style={styles.label}>{t("assistance.form.describeIssue")}</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder={t("assistance.form.descriptionPlaceholder")}
        multiline
        numberOfLines={4}
      />

      {/* Location — enter an address (Mapbox search) or use GPS. No manual
          coordinates: lat/lng are resolved behind the scenes from either. */}
      <Text style={styles.label}>{t("assistance.form.yourLocation")}</Text>
      <TouchableOpacity style={styles.addressField} onPress={openSearch}>
        <Text
          style={address ? styles.addressText : styles.addressPlaceholder}
          numberOfLines={2}
        >
          {address || t("assistance.form.searchAddress")}
        </Text>
        <Text style={styles.addressSearchIcon}>🔍</Text>
      </TouchableOpacity>
      <Text style={styles.orDivider}>{t("assistance.form.orDivider")}</Text>
      <TouchableOpacity style={styles.gpsBtn} onPress={() => handleGPS(false)} disabled={locating}>
        {locating ? (
          <ActivityIndicator color="#1D4ED8" />
        ) : (
          <Text style={styles.gpsBtnText}>{t("assistance.form.gpsButton")}</Text>
        )}
      </TouchableOpacity>

      {/* Bidding window */}
      <Text style={styles.label}>{t("assistance.form.biddingWindow")}</Text>
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
          <Text style={styles.submitBtnText}>{t("assistance.form.postRequest")}</Text>
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
