/**
 * LoginScreen — professional email/password authentication + sign-up.
 * Sprint 64 — Profile Fields (first name, last name, date of birth).
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { login as apiLogin, signup as apiSignup, exchangeFirebaseToken as apiExchangeFirebase } from "../api";
import { firebaseEnabled, signInEmail, signUpEmail, sendPasswordReset, resendVerification, firebaseSignOut } from "../auth";
import { useAuth } from "../context/AuthContext";
import ZizaCraftLogo from "../components/ZizaCraftLogo";

// Password field with a "Show password" checkbox (toggles visibility).
function PasswordField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}): React.ReactElement {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.pwField}>
      <TextInput
        style={[styles.input, styles.pwInputTight]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={!show}
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.pwToggle} onPress={() => setShow((s) => !s)} activeOpacity={0.7}>
        <View style={[styles.pwCheckbox, show && styles.pwCheckboxOn]}>
          {show ? <Text style={styles.pwCheckmark}>✓</Text> : null}
        </View>
        <Text style={styles.pwToggleLabel}>Show password</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LoginScreen(): React.ReactElement {
  const { login } = useAuth();

  // tab: "signin" | "signup"
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  // Sign-in state
  const [email, setEmail] = useState("professional@ziza.dev");
  const [password, setPassword] = useState("ziza2024");

  // Sign-up state
  const [suFirstName, setSuFirstName] = useState("");
  const [suLastName, setSuLastName] = useState("");
  const [suBirthDate, setSuBirthDate] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suPhone, setSuPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // When the backend refuses an unverified e-mail (prod gate), show a friendly
  // "verify your e-mail" notice instead of a raw error. (Sprint 67)
  const handleUnverified = async (addr: string, resend: boolean) => {
    if (resend) { try { await resendVerification(); } catch (_) { /* best effort */ } }
    await firebaseSignOut();
    setError(null);
    setNotice(`Please verify your email. We sent a link to ${addr} — tap it, then sign in.`);
  };

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const data = firebaseEnabled
        ? await apiExchangeFirebase(await signInEmail(email, password))
        : await apiLogin(email, password);
      await login(data.access_token, data.refresh_token ?? null);
    } catch (e: any) {
      if (e.message === "EMAIL_NOT_VERIFIED") { await handleUnverified(email.trim(), true); return; }
      setError(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email.trim()) { Alert.alert("Forgot password", "Enter your email above first."); return; }
    try {
      await sendPasswordReset(email.trim());
      Alert.alert("Password reset", "A reset email has been sent — check your inbox.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Could not send reset email.");
    }
  };

  const handleSignup = async () => {
    setError(null);
    if (!suFirstName.trim()) { setError("First name is required"); return; }
    if (!suLastName.trim()) { setError("Last name is required"); return; }
    if (!suBirthDate.trim()) { setError("Date of birth is required (YYYY-MM-DD)"); return; }
    if (!suEmail.trim()) { setError("Email is required"); return; }
    if (suPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (suPassword !== suConfirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    setNotice(null);
    try {
      const data = firebaseEnabled
        ? await apiExchangeFirebase(await signUpEmail(suEmail.trim(), suPassword), { firstName: suFirstName.trim(), lastName: suLastName.trim(), birthDate: suBirthDate.trim(), phone: suPhone || null })
        : await apiSignup(suEmail.trim(), suPassword, suFirstName.trim(), suLastName.trim(), suBirthDate.trim(), suPhone || null);
      await login(data.access_token, data.refresh_token ?? null);
    } catch (e: any) {
      if (e.message === "EMAIL_NOT_VERIFIED") { await handleUnverified(suEmail.trim(), false); return; }
      setError(e.message || "Sign-up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrapper}>
          <ZizaCraftLogo size={80} />
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, tab === "signin" && styles.tabActive]}
            onPress={() => { setTab("signin"); setError(null); }}
          >
            <Text style={[styles.tabText, tab === "signin" && styles.tabTextActive]}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "signup" && styles.tabActive]}
            onPress={() => { setTab("signup"); setError(null); }}
          >
            <Text style={[styles.tabText, tab === "signup" && styles.tabTextActive]}>Join as Pro</Text>
          </TouchableOpacity>
        </View>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {tab === "signin" ? (
          <>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
            <PasswordField value={password} onChangeText={setPassword} placeholder="Password" />
            <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
            </TouchableOpacity>
            {firebaseEnabled && (
              <TouchableOpacity onPress={handleForgot}>
                <Text style={styles.forgot}>Forgot password?</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.hint}>Dev: professional@ziza.dev / ziza2024</Text>
          </>
        ) : (
          <>
            <TextInput style={styles.input} value={suFirstName} onChangeText={setSuFirstName} placeholder="First name" autoCapitalize="words" />
            <TextInput style={styles.input} value={suLastName} onChangeText={setSuLastName} placeholder="Last name" autoCapitalize="words" />
            <TextInput style={styles.input} value={suBirthDate} onChangeText={setSuBirthDate} placeholder="Date of birth (YYYY-MM-DD)" keyboardType="numbers-and-punctuation" />
            <TextInput style={styles.input} value={suEmail} onChangeText={setSuEmail} placeholder="Email address" keyboardType="email-address" autoCapitalize="none" />
            <PasswordField value={suPassword} onChangeText={setSuPassword} placeholder="Password (min. 6 characters)" />
            <PasswordField value={suConfirm} onChangeText={setSuConfirm} placeholder="Confirm password" />
            <TextInput style={styles.input} value={suPhone} onChangeText={setSuPhone} placeholder="Phone number (optional)" keyboardType="phone-pad" />
            <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join as Professional</Text>}
            </TouchableOpacity>
            <Text style={styles.hint}>After sign-up, complete your professional profile to receive service requests.</Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logoWrapper: { alignItems: "center", marginBottom: 12 },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
    color: "#059669",
  },
  subtitle: { fontSize: 14, color: "#888", textAlign: "center", marginBottom: 20 },
  tabBar: { flexDirection: "row", borderRadius: 8, backgroundColor: "#F3F4F6", marginBottom: 20, overflow: "hidden" },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive: { backgroundColor: "#059669" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#6B7280" },
  tabTextActive: { color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  pwField: { marginBottom: 12 },
  pwInputTight: { marginBottom: 6 },
  pwToggle: { flexDirection: "row", alignItems: "center" },
  pwCheckbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: "#bbb", alignItems: "center", justifyContent: "center", marginRight: 8 },
  pwCheckboxOn: { backgroundColor: "#059669", borderColor: "#059669" },
  pwCheckmark: { color: "#fff", fontSize: 12, fontWeight: "bold", lineHeight: 14 },
  pwToggleLabel: { fontSize: 13, color: "#666" },
  button: {
    backgroundColor: "#059669",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  error: { color: "red", textAlign: "center", marginBottom: 12, fontSize: 14 },
  notice: { color: "#065f46", backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0", borderRadius: 8, padding: 10, textAlign: "center", marginBottom: 12, fontSize: 13 },
  hint: { fontSize: 12, color: "#aaa", textAlign: "center", marginTop: 12 },
  forgot: { fontSize: 13, color: "#059669", textAlign: "center", marginTop: 12, textDecorationLine: "underline" },
});
