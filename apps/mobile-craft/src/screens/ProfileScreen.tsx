/**
 * ProfileScreen — professional manages their profile and specialties.
 * Sprint 53 — added Documents link.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  registerProfessional, updateProfessionalProfile, CRAFT_CATEGORIES,
  getProfile, updateProfile, avatarUploadUrl, getBankAccount, setBankAccount,
  UserProfile, BankAccountInfo,
} from "../api";
import { RootStackParamList } from "../navigation/AppNavigator";
import { firebaseEnabled, changeEmail } from "../auth";
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
  breakdown: "requests", flat_tyre: "tire", tow: "tow", fuel: "fuel",
  lockout: "lock", battery: "battery", accident: "alert",
  diagnostics: "search", other: "requests",
};
import { useAuth } from "../context/AuthContext";

type ProfileNav = NativeStackNavigationProp<RootStackParamList, "Profile">;

const ACCENT = "#1D4ED8";

function AccountSection({ token }: { token: string }): React.ReactElement {
  const [me, setMe] = useState<UserProfile | null>(null);
  const [bank, setBank] = useState<BankAccountInfo | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [holder, setHolder] = useState("");
  const [routing, setRouting] = useState("");
  const [number, setNumber] = useState("");
  const [acctType, setAcctType] = useState("checking");
  const [savingBank, setSavingBank] = useState(false);
  const [bankMsg, setBankMsg] = useState<string | null>(null);
  // Sprint 67 — change e-mail (Firebase verify-before-update)
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const submitEmailChange = async () => {
    if (!newEmail.trim()) { setEmailMsg("Enter a new email."); return; }
    setEmailBusy(true); setEmailMsg(null);
    try {
      await changeEmail(newEmail.trim());
      setEmailMsg(`Confirmation link sent to ${newEmail.trim()}. Tap it, then sign in again.`);
      setNewEmail(""); setEmailOpen(false);
    } catch (e: any) {
      setEmailMsg(e?.message || "Could not change email.");
    } finally { setEmailBusy(false); }
  };

  const load = useCallback(() => {
    getProfile(token).then(setMe).catch(() => {});
    getBankAccount(token).then((b) => { setBank(b); if (b) setHolder(b.account_holder_name); }).catch(() => {});
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7,
    });
    if (res.canceled || !res.assets || !res.assets[0]) return;
    const asset = res.assets[0];
    setAvatarBusy(true);
    try {
      const ct = (asset as any).mimeType || "image/jpeg";
      const name = (asset as any).fileName || "avatar.jpg";
      const { upload_url, final_url } = await avatarUploadUrl(token, name, ct);
      const blob = await (await fetch(asset.uri)).blob();
      await fetch(upload_url, { method: "PUT", headers: { "Content-Type": ct }, body: blob });
      setMe(await updateProfile(token, { avatar_url: final_url }));
    } catch { /* ignore */ } finally { setAvatarBusy(false); }
  };

  const saveBank = async () => {
    if (savingBank) return;
    setSavingBank(true); setBankMsg(null);
    try {
      const b = await setBankAccount(token, {
        account_holder_name: holder, routing_number: routing, account_number: number, account_type: acctType,
      });
      setBank(b); setNumber(""); setBankMsg("✓ Bank account saved");
    } catch (e: any) { setBankMsg(e?.message || "Save failed"); }
    finally { setSavingBank(false); }
  };

  return (
    <View>
      <View style={acc.avatarRow}>
        <View style={acc.avatar}>
          {me?.avatar_url
            ? <Image source={{ uri: me.avatar_url }} style={{ width: "100%", height: "100%" }} />
            : <Text style={{ fontSize: 28 }}>👤</Text>}
        </View>
        <TouchableOpacity onPress={pickAvatar} disabled={avatarBusy}>
          <Text style={{ color: ACCENT, fontWeight: "700" }}>{avatarBusy ? "Uploading…" : "📷 Change photo"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>✉️ Email</Text>
      {me?.email ? <Text style={acc.onFile}>{me.email}</Text> : null}
      {firebaseEnabled && (
        emailOpen ? (
          <>
            <TextInput
              style={styles.input} value={newEmail} onChangeText={setNewEmail}
              placeholder="New email address" autoCapitalize="none" keyboardType="email-address"
            />
            <View style={acc.typeRow}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1 }, emailBusy && styles.saveBtnDisabled]} onPress={submitEmailChange} disabled={emailBusy}>
                <Text style={styles.saveBtnText}>{emailBusy ? "…" : "Send confirmation"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[acc.typeBtn, { flex: 1 }]} onPress={() => { setEmailOpen(false); setEmailMsg(null); }} disabled={emailBusy}>
                <Text style={acc.typeTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <TouchableOpacity onPress={() => { setEmailOpen(true); setEmailMsg(null); }} style={{ marginBottom: 16 }}>
            <Text style={{ color: ACCENT, fontWeight: "700" }}>✉️ Change email</Text>
          </TouchableOpacity>
        )
      )}
      {emailMsg && <Text style={styles.successText}>{emailMsg}</Text>}

      <Text style={styles.sectionTitle}>🏦 Payout bank account</Text>
      {bank && <Text style={acc.onFile}>On file: {bank.account_holder_name} · ****{bank.account_number_last4} ({bank.account_type})</Text>}
      <TextInput style={styles.input} value={holder} onChangeText={setHolder} placeholder="Account holder name" />
      <TextInput style={styles.input} value={routing} onChangeText={setRouting} placeholder="Routing number" keyboardType="number-pad" />
      <TextInput style={styles.input} value={number} onChangeText={setNumber} placeholder={bank ? "Enter to replace account number" : "Account number"} keyboardType="number-pad" />
      <View style={acc.typeRow}>
        {(["checking", "savings"] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setAcctType(t)}
            style={[acc.typeBtn, acctType === t && { backgroundColor: ACCENT, borderColor: ACCENT }]}>
            <Text style={[acc.typeTxt, acctType === t && { color: "#fff" }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={[styles.saveBtn, savingBank && styles.saveBtnDisabled]} onPress={saveBank} disabled={savingBank}>
        <Text style={styles.saveBtnText}>{savingBank ? "Saving…" : "Save bank account"}</Text>
      </TouchableOpacity>
      {bankMsg && <Text style={styles.successText}>{bankMsg}</Text>}
    </View>
  );
}

const acc = StyleSheet.create({
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  onFile: { fontSize: 13, color: "#6B7280", marginBottom: 8 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  typeBtn: { flex: 1, borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8, paddingVertical: 10, alignItems: "center", backgroundColor: "#fff" },
  typeTxt: { textTransform: "capitalize", color: "#374151", fontWeight: "600" },
});

export default function ProfileScreen(): React.ReactElement {
  const { token, profile, refreshProfile, logout } = useAuth();
  const navigation = useNavigation<ProfileNav>();
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

      {token ? <AccountSection token={token} /> : null}

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
            <Icon name={CAT_ICON[cat] ?? "requests"} size={15} color={specialties.has(cat) ? "#1D4ED8" : "#374151"} />
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

      <TouchableOpacity
        style={styles.docsBtn}
        onPress={() => navigation.navigate("Documents")}
      >
        <Text style={styles.docsBtnText}>📄 My Documents</Text>
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
  title: { fontSize: 22, fontWeight: "bold", color: "#1D4ED8", marginBottom: 16 },
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
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  bioInput: { height: 100, textAlignVertical: "top" },
  errorText: { color: "#EF4444", textAlign: "center", marginBottom: 8, fontSize: 13 },
  successText: { color: "#1D4ED8", textAlign: "center", marginBottom: 8, fontSize: 13, fontWeight: "600" },
  saveBtn: {
    backgroundColor: "#1D4ED8",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  docsBtn: {
    backgroundColor: "#1D4ED8",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  docsBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  logoutBtn: {
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  logoutBtnText: { color: "#EF4444", fontWeight: "600", fontSize: 15 },
});
