/**
 * ProfileScreen — professional manages their profile and specialties.
 * Sprint 47 — Ziza Craft.
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
import { registerProfessional, updateProfessionalProfile, CRAFT_CATEGORIES } from "../api";

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

export default function ProfileScreen(): React.ReactElement {
  const { token, profile, refreshProfile, logout } = useAuth();
  const [specialties, setSpecialties] = useState<Set<string>>(new Set());
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (profile) {
      setSpecialties(
        new Set(
          profile.specialties
            ? profile.specialties.split(",").map((s) => s.trim()).filter(Boolean)
            : []
        )
      );
      setBio(profile.bio ?? "");
    }
  }, [profile]);

  const toggleSpecialty = (cat: string) => {
    setSpecialties((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleRegisterOrUpdate = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    const specialtiesStr = Array.from(specialties).join(",");
    try {
      if (!profile) {
        await registerProfessional(token, specialtiesStr, bio.trim() || null);
      } else {
        await updateProfessionalProfile(token, {
          specialties: specialtiesStr,
          bio: bio.trim() || null,
        });
      }
      await refreshProfile();
      setSuccess(true);
    } catch (e: any) {
      setError(e.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => logout() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Professional Profile</Text>

      {profile ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={styles.infoValue}>{profile.status}</Text>
          <Text style={styles.infoLabel}>Online</Text>
          <Text style={styles.infoValue}>{profile.is_online ? "Yes" : "No"}</Text>
        </View>
      ) : (
        <View style={styles.notRegistered}>
          <Text style={styles.notRegisteredText}>
            You are not yet registered as a professional. Select your specialties below and register.
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>My Specialties</Text>
      <View style={styles.categories}>
        {CRAFT_CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.catChip, specialties.has(cat) && styles.catChipSelected]}
            onPress={() => toggleSpecialty(cat)}
          >
            <Text style={[styles.catChipText, specialties.has(cat) && styles.catChipTextSelected]}>
              {CAT_LABELS[cat] ?? cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Bio</Text>
      <TextInput
        style={[styles.input, styles.bioInput]}
        value={bio}
        onChangeText={setBio}
        placeholder="Describe your experience and skills..."
        multiline
        numberOfLines={4}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {success ? <Text style={styles.successText}>Profile saved!</Text> : null}

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleRegisterOrUpdate}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>
            {profile ? "Save Changes" : "Register as Professional"}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutBtnText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "bold", color: "#059669", marginBottom: 16 },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  infoLabel: { fontSize: 11, color: "#9CA3AF", fontWeight: "600", marginTop: 4 },
  infoValue: { fontSize: 15, color: "#111827", fontWeight: "500" },
  notRegistered: {
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  notRegisteredText: { color: "#92400E", fontSize: 13 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#374151", marginBottom: 10 },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  catChip: {
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  catChipSelected: { backgroundColor: "#ECFDF5", borderColor: "#059669" },
  catChipText: { fontSize: 13, color: "#374151" },
  catChipTextSelected: { color: "#059669", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  bioInput: { height: 100, textAlignVertical: "top" },
  errorText: { color: "#EF4444", textAlign: "center", marginBottom: 8, fontSize: 13 },
  successText: { color: "#059669", textAlign: "center", marginBottom: 8, fontSize: 13, fontWeight: "600" },
  saveBtn: {
    backgroundColor: "#059669",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  logoutBtn: {
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  logoutBtnText: { color: "#EF4444", fontWeight: "600", fontSize: 15 },
});
