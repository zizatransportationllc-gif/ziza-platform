/**
 * VehicleScreen — driver vehicle registration and management.
 * Sprint 62 — Vehicle tile.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { getMyVehicle, registerVehicle, VehicleResponse } from "../api";

const VEHICLE_CATEGORIES = [
  { value: "economy",  label: "🚗 Economy" },
  { value: "comfort",  label: "🛋️ Comfort" },
  { value: "xl",       label: "🚐 XL" },
  { value: "electric", label: "⚡ Electric" },
];

export default function VehicleScreen(): React.ReactElement {
  const { token } = useAuth();

  const [vehicle, setVehicle]   = useState<VehicleResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Form fields
  const [plate, setPlate]       = useState("");
  const [make, setMake]         = useState("");
  const [model, setModel]       = useState("");
  const [year, setYear]         = useState("");
  const [color, setColor]       = useState("");
  const [category, setCategory] = useState("economy");

  const load = async () => {
    if (!token) return;
    try {
      const v = await getMyVehicle(token);
      setVehicle(v);
      if (v) {
        setPlate(v.plate ?? "");
        setMake(v.make ?? "");
        setModel(v.model ?? "");
        setYear(v.year ? String(v.year) : "");
        setColor(v.color ?? "");
        setCategory(v.category ?? "economy");
      } else {
        setEditing(true); // no vehicle yet → open form immediately
      }
    } catch {
      setError("Failed to load vehicle info.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const handleSave = async () => {
    if (!plate.trim()) {
      Alert.alert("Required", "License plate is required.");
      return;
    }
    if (!token) return;
    setSaving(true); setError(null);
    try {
      const v = await registerVehicle(
        token,
        plate.trim(),
        make.trim() || null,
        model.trim() || null,
        year ? Number(year) : null,
        color.trim() || null,
        category,
      );
      setVehicle(v);
      setEditing(false);
      Alert.alert("Saved", "Vehicle information saved.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save vehicle.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    if (vehicle) {
      setPlate(vehicle.plate ?? "");
      setMake(vehicle.make ?? "");
      setModel(vehicle.model ?? "");
      setYear(vehicle.year ? String(vehicle.year) : "");
      setColor(vehicle.color ?? "");
      setCategory(vehicle.category ?? "economy");
    }
    setEditing(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1D4ED8" />
      </View>
    );
  }

  // ── Display mode ────────────────────────────────────────────────────────────
  if (vehicle && !editing) {
    const catLabel = VEHICLE_CATEGORIES.find((c) => c.value === vehicle.category)?.label ?? vehicle.category;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>🚗 My Vehicle</Text>
        <View style={styles.card}>
          <Text style={styles.plate}>{vehicle.plate}</Text>
          <Text style={styles.meta}>
            {[vehicle.color, vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" · ")}
          </Text>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{catLabel}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.editBtn} onPress={startEdit}>
          <Text style={styles.editBtnText}>✏️ Edit Vehicle</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Edit / Register mode ────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>
        {vehicle ? "✏️ Edit Vehicle" : "🚗 Register My Vehicle"}
      </Text>

      <Text style={styles.fieldLabel}>License Plate *</Text>
      <TextInput
        style={styles.input}
        value={plate}
        onChangeText={setPlate}
        placeholder="e.g. ABC-1234"
        placeholderTextColor="#9CA3AF"
        autoCapitalize="characters"
      />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>Make</Text>
          <TextInput
            style={styles.input}
            value={make}
            onChangeText={setMake}
            placeholder="Toyota"
            placeholderTextColor="#9CA3AF"
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>Model</Text>
          <TextInput
            style={styles.input}
            value={model}
            onChangeText={setModel}
            placeholder="Camry"
            placeholderTextColor="#9CA3AF"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>Year</Text>
          <TextInput
            style={styles.input}
            value={year}
            onChangeText={setYear}
            placeholder="2021"
            placeholderTextColor="#9CA3AF"
            keyboardType="numeric"
            maxLength={4}
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.fieldLabel}>Color</Text>
          <TextInput
            style={styles.input}
            value={color}
            onChangeText={setColor}
            placeholder="Black"
            placeholderTextColor="#9CA3AF"
          />
        </View>
      </View>

      <Text style={styles.fieldLabel}>Category</Text>
      <View style={styles.categoryRow}>
        {VEHICLE_CATEGORIES.map(({ value, label }) => (
          <TouchableOpacity
            key={value}
            style={[styles.catChip, category === value && styles.catChipSelected]}
            onPress={() => setCategory(value)}
          >
            <Text style={[styles.catChipText, category === value && styles.catChipTextSelected]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveBtnText}>✓ Save</Text>}
      </TouchableOpacity>

      {vehicle && (
        <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  heading: { fontSize: 22, fontWeight: "bold", color: "#1D4ED8", marginBottom: 20 },

  // Display card
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  plate: { fontSize: 28, fontWeight: "900", color: "#111827", letterSpacing: 2, marginBottom: 6 },
  meta: { fontSize: 15, color: "#6B7280", marginBottom: 12 },
  categoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#EFF6FF",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  categoryBadgeText: { color: "#1D4ED8", fontWeight: "700", fontSize: 13 },
  editBtn: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#1D4ED8",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  editBtnText: { color: "#1D4ED8", fontWeight: "700", fontSize: 15 },

  // Form
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 4, marginTop: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#111827",
  },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  catChip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  catChipSelected: { backgroundColor: "#1D4ED8", borderColor: "#1D4ED8" },
  catChipText: { color: "#374151", fontSize: 13, fontWeight: "500" },
  catChipTextSelected: { color: "#fff", fontWeight: "700" },

  errorText: { color: "#EF4444", fontSize: 13, marginTop: 12 },
  saveBtn: { backgroundColor: "#1D4ED8", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 20 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  cancelBtn: { padding: 12, alignItems: "center", marginTop: 8 },
  cancelBtnText: { color: "#6B7280", fontSize: 15 },
});
