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
import { firebaseEnabled, signInEmail, signUpEmail, sendPasswordReset } from "../auth";
import { useAuth } from "../context/AuthContext";

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

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = firebaseEnabled
        ? await apiExchangeFirebase(await signInEmail(email, password))
        : await apiLogin(email, password);
      await login(data.access_token, data.refresh_token ?? null);
    } catch (e: any) {
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
    try {
      const data = firebaseEnabled
        ? await apiExchangeFirebase(await signUpEmail(suEmail.trim(), suPassword), { firstName: suFirstName.trim(), lastName: suLastName.trim(), birthDate: suBirthDate.trim(), phone: suPhone || null })
        : await apiSignup(suEmail.trim(), suPassword, suFirstName.trim(), suLastName.trim(), suBirthDate.trim(), suPhone || null);
      await login(data.access_token, data.refresh_token ?? null);
    } catch (e: any) {
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
        <Text style={styles.title}>Ziza Craft</Text>
        <Text style={styles.subtitle}>Sprint 64 — Profile Fields</Text>

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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {tab === "signin" ? (
          <>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />
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
            <TextInput style={styles.input} value={suPassword} onChangeText={setSuPassword} placeholder="Password (min. 6 characters)" secureTextEntry />
            <TextInput style={styles.input} value={suConfirm} onChangeText={setSuConfirm} placeholder="Confirm password" secureTextEntry />
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
  button: {
    backgroundColor: "#059669",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  error: { color: "red", textAlign: "center", marginBottom: 12, fontSize: 14 },
  hint: { fontSize: 12, color: "#aaa", textAlign: "center", marginTop: 12 },
  forgot: { fontSize: 13, color: "#059669", textAlign: "center", marginTop: 12, textDecorationLine: "underline" },
});
