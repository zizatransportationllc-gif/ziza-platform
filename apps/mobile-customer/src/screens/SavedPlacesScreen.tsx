/**
 * SavedPlacesScreen — manage the customer's saved places (home / work / other).
 * Sprint 65 — parity with web-customer's SavedPlacesSection. Full CRUD; the
 * address + coordinates are set by reusing the Places autocomplete picker.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import {
  listSavedPlaces,
  createSavedPlace,
  updateSavedPlace,
  deleteSavedPlace,
  SavedPlace,
} from "../api";
import { useAuth } from "../context/AuthContext";

type NavProp = NativeStackNavigationProp<RootStackParamList, "SavedPlaces">;

const MAX_PLACES = 10;
const LABELS: { value: string; icon: string; name: string }[] = [
  { value: "home", icon: "🏠", name: "Home" },
  { value: "work", icon: "💼", name: "Work" },
  { value: "other", icon: "📍", name: "Other" },
];
const labelMeta = (v: string) => LABELS.find((l) => l.value === v) ?? LABELS[2];

export default function SavedPlacesScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation<NavProp>();
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state (null = closed)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formLabel, setFormLabel] = useState("home");
  const [formName, setFormName] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setPlaces(await listSavedPlaces(token));
    } catch (e: any) {
      setError(e.message || "Failed to load places");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditingId(null);
    setFormLabel("home");
    setFormName("");
    setCoords(null);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (p: SavedPlace) => {
    setEditingId(p.place_id);
    setFormLabel(p.label);
    setFormName(p.name);
    setCoords({ lat: p.lat, lng: p.lng });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setEditingId(null); };

  const pickAddress = () => {
    navigation.navigate("Places", {
      onSelect: (place: { lat: number; lng: number; name: string }) => {
        setCoords({ lat: place.lat, lng: place.lng });
        // Prefill the name from the picked address if the user hasn't typed one.
        setFormName((cur) => (cur.trim() ? cur : place.name));
      },
    });
  };

  const handleSave = async () => {
    if (!token) return;
    if (!formName.trim()) { setFormError("Please enter a name."); return; }
    if (!coords) { setFormError("Please pick an address."); return; }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        const updated = await updateSavedPlace(token, editingId, {
          label: formLabel,
          name: formName.trim(),
          lat: coords.lat,
          lng: coords.lng,
        });
        setPlaces((prev) => prev.map((p) => (p.place_id === editingId ? updated : p)));
      } else {
        const created = await createSavedPlace(
          token,
          formLabel,
          formName.trim(),
          coords.lat,
          coords.lng,
        );
        setPlaces((prev) => [...prev, created]);
      }
      closeForm();
    } catch (e: any) {
      setFormError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (p: SavedPlace) => {
    Alert.alert("Delete place", `Remove “${p.name}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          const prev = places;
          setPlaces((cur) => cur.filter((x) => x.place_id !== p.place_id)); // optimistic
          try {
            await deleteSavedPlace(token, p.place_id);
          } catch (e: any) {
            setPlaces(prev); // restore on failure
            setError(e.message || "Failed to delete");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.heading}>📍 My Places</Text>
        {!showForm && places.length < MAX_PLACES && (
          <TouchableOpacity style={styles.addBtn} onPress={openNew}>
            <Text style={styles.addBtnText}>✚ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>{editingId ? "✎ Edit Place" : "✚ New Place"}</Text>

          <Text style={styles.fieldLabel}>Type</Text>
          <View style={styles.labelRow}>
            {LABELS.map((l) => (
              <TouchableOpacity
                key={l.value}
                style={[styles.labelBtn, formLabel === l.value && styles.labelBtnActive]}
                onPress={() => setFormLabel(l.value)}
              >
                <Text style={[styles.labelBtnText, formLabel === l.value && styles.labelBtnTextActive]}>
                  {l.icon} {l.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.input}
            value={formName}
            onChangeText={setFormName}
            placeholder="Ex: Home Jersey City, Office Newark…"
            maxLength={256}
          />

          <Text style={styles.fieldLabel}>Address</Text>
          <TouchableOpacity style={styles.pickBtn} onPress={pickAddress}>
            <Text style={styles.pickBtnText}>
              {coords ? "📍 Change address…" : "🔍 Search address…"}
            </Text>
          </TouchableOpacity>
          {coords && (
            <Text style={styles.coordsHint}>
              {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </Text>
          )}

          {formError ? <Text style={styles.error}>{formError}</Text> : null}

          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.btnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>
                {saving ? "…" : editingId ? "✓ Update" : "✚ Save"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={closeForm} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!showForm && places.length === 0 && (
        <Text style={styles.empty}>
          No saved places. Tap ✚ Add to save your frequent addresses.
        </Text>
      )}

      {places.map((p) => {
        const meta = labelMeta(p.label);
        return (
          <View key={p.place_id} style={styles.card}>
            <Text style={styles.cardIcon}>{meta.icon}</Text>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.cardMeta}>{meta.name}</Text>
            </View>
            <TouchableOpacity style={styles.cardAction} onPress={() => openEdit(p)}>
              <Text style={styles.cardActionText}>✎</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardAction} onPress={() => confirmDelete(p)}>
              <Text style={styles.cardActionText}>🗑</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      {places.length >= MAX_PLACES && !showForm && (
        <Text style={styles.limitHint}>{MAX_PLACES} places limit reached.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  heading: { fontSize: 20, fontWeight: "bold", color: "#111827" },
  addBtn: { backgroundColor: "#1D4ED8", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  error: { color: "#EF4444", fontSize: 13, marginVertical: 6 },

  form: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  formTitle: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#6B7280", marginTop: 8, marginBottom: 6 },
  labelRow: { flexDirection: "row", gap: 8 },
  labelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  labelBtnActive: { borderColor: "#1D4ED8", backgroundColor: "#EEF3FE" },
  labelBtnText: { fontSize: 13, color: "#374151", fontWeight: "600" },
  labelBtnTextActive: { color: "#1E40AF" },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  pickBtn: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F9FAFB",
  },
  pickBtnText: { fontSize: 14, color: "#374151" },
  coordsHint: { fontSize: 12, color: "#9CA3AF", marginTop: 6 },
  formActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  saveBtn: { flex: 1, backgroundColor: "#1D4ED8", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { color: "#6B7280", fontWeight: "600", fontSize: 14 },

  empty: { color: "#9CA3AF", textAlign: "center", marginTop: 24 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  cardIcon: { fontSize: 22 },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  cardMeta: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  cardAction: { paddingHorizontal: 6, paddingVertical: 4 },
  cardActionText: { fontSize: 18 },
  limitHint: { fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 8 },
});
