/**
 * ProfileScreen — user profile: photo, bank account, documents, logout.
 * Sprint 69 — added profile photo + bank account.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, TextInput, ActivityIndicator,
  Linking, Platform, Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/AppNavigator";
import {
  getProfile, updateProfile, avatarUploadUrl, getBankAccount, setBankAccount,
  UserProfile, BankAccountInfo,
} from "../api";

type ProfileNav = NativeStackNavigationProp<RootStackParamList, "Profile">;

const ACCENT = "#F97316";
const DRIVER_BLUE = "#1D4ED8"; // Ziza Driver brand color

// "Become a Driver" sends the user to the standalone Ziza Driver app's store
// page. Store IDs are configurable via env (the apps may not be published yet);
// defaults point at the Play Store listing (Android package known) and an App
// Store search fallback until the numeric App Store ID is provided.
const DRIVER_ANDROID_URL =
  process.env.EXPO_PUBLIC_DRIVER_ANDROID_URL ||
  "https://play.google.com/store/apps/details?id=com.zizatransportation.driver";
const DRIVER_IOS_URL =
  process.env.EXPO_PUBLIC_DRIVER_IOS_URL ||
  "https://apps.apple.com/search?term=ziza%20driver";

async function openDriverStore(): Promise<void> {
  const url = Platform.OS === "ios" ? DRIVER_IOS_URL : DRIVER_ANDROID_URL;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Unable to open the store", "Please search for “Ziza Driver” in your app store.");
  }
}

function AccountSection({ token }: { token: string }): React.ReactElement {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bank, setBank] = useState<BankAccountInfo | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [holder, setHolder] = useState("");
  const [routing, setRouting] = useState("");
  const [number, setNumber] = useState("");
  const [type, setType] = useState("checking");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    getProfile(token).then(setProfile).catch(() => {});
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
      setProfile(await updateProfile(token, { avatar_url: final_url }));
    } catch { /* ignore */ } finally { setAvatarBusy(false); }
  };

  const saveBank = async () => {
    if (saving) return;
    setSaving(true); setMsg(null);
    try {
      const b = await setBankAccount(token, {
        account_holder_name: holder, routing_number: routing, account_number: number, account_type: type,
      });
      setBank(b); setNumber(""); setMsg("✓ Bank account saved");
    } catch (e: any) { setMsg(e?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <View>
      <View style={styles.avatarRow}>
        <View style={styles.avatar}>
          {profile?.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
            : <Text style={styles.avatarPlaceholder}>👤</Text>}
        </View>
        <TouchableOpacity onPress={pickAvatar} disabled={avatarBusy}>
          <Text style={[styles.changePhoto, { color: ACCENT }]}>{avatarBusy ? "Uploading…" : "📷 Change photo"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>🏦 Bank account</Text>
      {bank && <Text style={styles.onFile}>On file: {bank.account_holder_name} · ****{bank.account_number_last4} ({bank.account_type})</Text>}
      <TextInput style={styles.input} value={holder} onChangeText={setHolder} placeholder="Account holder name" />
      <TextInput style={styles.input} value={routing} onChangeText={setRouting} placeholder="Routing number" keyboardType="number-pad" />
      <TextInput style={styles.input} value={number} onChangeText={setNumber} placeholder={bank ? "Enter to replace account number" : "Account number"} keyboardType="number-pad" />
      <View style={styles.typeRow}>
        {(["checking", "savings"] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setType(t)}
            style={[styles.typeBtn, type === t && { backgroundColor: ACCENT, borderColor: ACCENT }]}>
            <Text style={[styles.typeTxt, type === t && { color: "#fff" }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={saveBank} disabled={saving}>
        <Text style={styles.saveTxt}>{saving ? "Saving…" : "Save bank account"}</Text>
      </TouchableOpacity>
      {msg && <Text style={styles.msg}>{msg}</Text>}
    </View>
  );
}

export default function ProfileScreen(): React.ReactElement {
  const { logout, token } = useAuth() as any;
  const navigation = useNavigation<ProfileNav>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.heading}>My Profile</Text>

      {token ? <AccountSection token={token} /> : <ActivityIndicator />}

      <TouchableOpacity style={styles.docsButton} onPress={() => navigation.navigate("Documents")}>
        <Text style={styles.docsText}>📄 My Documents</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.becomeDriverButton} onPress={openDriverStore}>
        <Text style={styles.becomeDriverText}>🧑‍✈️ Become a Driver</Text>
      </TouchableOpacity>
      <Text style={styles.becomeDriverHint}>Opens the Ziza Driver app in your store.</Text>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },

  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarPlaceholder: { fontSize: 28 },
  changePhoto: { fontSize: 14, fontWeight: "700" },

  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginTop: 6, marginBottom: 8 },
  onFile: { fontSize: 13, color: "#6B7280", marginBottom: 8 },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 10 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  typeBtn: { flex: 1, borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 8, paddingVertical: 10, alignItems: "center", backgroundColor: "#fff" },
  typeTxt: { textTransform: "capitalize", color: "#374151", fontWeight: "600" },
  saveBtn: { backgroundColor: ACCENT, borderRadius: 8, padding: 13, alignItems: "center" },
  saveTxt: { color: "#fff", fontWeight: "700" },
  msg: { color: "#059669", fontSize: 13, marginTop: 8, marginBottom: 4 },

  docsButton: { backgroundColor: ACCENT, borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16, marginBottom: 12 },
  docsText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  becomeDriverButton: { backgroundColor: DRIVER_BLUE, borderRadius: 8, padding: 14, alignItems: "center", marginBottom: 4 },
  becomeDriverText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  becomeDriverHint: { color: "#6B7280", fontSize: 12, textAlign: "center", marginBottom: 12 },
  logoutButton: { backgroundColor: "#EF4444", borderRadius: 8, padding: 14, alignItems: "center" },
  logoutText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
