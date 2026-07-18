/**
 * PaymentMethodsScreen — Sprint 73.
 *
 * Save and manage cards for ride payments. The card is entered via Stripe's
 * native CardField (PCI-compliant — raw card data never reaches Ziza) and saved
 * with a SetupIntent. Rides are charged automatically on completion.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
} from "react-native";
import { CardField, useConfirmSetupIntent } from "@stripe/stripe-react-native";

import { useAuth } from "../context/AuthContext";
import {
  createSetupIntent, listPaymentMethods, deletePaymentMethod,
  setDefaultPaymentMethod, SavedCard,
} from "../api";

export default function PaymentMethodsScreen(): React.ReactElement {
  const { token } = useAuth();
  const { confirmSetupIntent, loading } = useConfirmSetupIntent();
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [adding, setAdding] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoadingList(true);
    listPaymentMethods(token)
      .then(setCards)
      .catch(() => setCards([]))
      .finally(() => setLoadingList(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!token) return;
    setBusy(true); setErr(null);
    try {
      const { client_secret } = await createSetupIntent(token);
      const { setupIntent, error } = await confirmSetupIntent(client_secret, {
        paymentMethodType: "Card",
      });
      if (error) setErr(error.message);
      else if (setupIntent) { setAdding(false); setCardComplete(false); load(); }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not save card");
    } finally { setBusy(false); }
  }

  async function act(fn: () => Promise<void>) {
    setBusy(true); setErr(null);
    try { await fn(); load(); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>💳 Payment methods</Text>
      <Text style={styles.hint}>
        Add a card to book rides. You're charged automatically when the ride
        completes — nothing to do at pickup.
      </Text>

      {loadingList ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <>
          {cards.length === 0 && !adding && <Text style={styles.empty}>No card saved yet.</Text>}
          {cards.map((c) => (
            <View key={c.id} style={styles.cardRow}>
              <Text style={styles.cardText}>
                {(c.brand || "card")} •••• {c.last4}
                {"  "}· {String(c.exp_month).padStart(2, "0")}/{c.exp_year}
                {c.is_default ? "  · Default" : ""}
              </Text>
              <View style={styles.actions}>
                {!c.is_default && (
                  <TouchableOpacity disabled={busy} onPress={() => act(() => setDefaultPaymentMethod(token!, c.id))}>
                    <Text style={styles.link}>Default</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity disabled={busy} onPress={() => act(() => deletePaymentMethod(token!, c.id))}>
                  <Text style={[styles.link, styles.remove]}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {adding ? (
            <View style={{ marginTop: 12 }}>
              <CardField
                postalCodeEnabled
                style={styles.cardField}
                cardStyle={{ backgroundColor: "#ffffff", textColor: "#111827" }}
                onCardChange={(d) => setCardComplete(d.complete)}
              />
              <TouchableOpacity
                style={[styles.btn, (!cardComplete || busy || loading) && styles.btnDisabled]}
                disabled={!cardComplete || busy || loading}
                onPress={handleAdd}
              >
                <Text style={styles.btnText}>{busy || loading ? "Saving…" : "Save card"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setAdding(false); setErr(null); }}>
                <Text style={[styles.link, { textAlign: "center", marginTop: 8 }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.btn} onPress={() => { setErr(null); setAdding(true); }}>
              <Text style={styles.btnText}>+ Add a card</Text>
            </TouchableOpacity>
          )}
        </>
      )}
      {err ? <Text style={styles.err}>{err}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  hint: { color: "#6B7280", fontSize: 13, marginTop: 4, marginBottom: 16 },
  empty: { color: "#6B7280", marginVertical: 12 },
  cardRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 14, marginBottom: 8,
  },
  cardText: { fontSize: 14, color: "#111827", flexShrink: 1 },
  actions: { flexDirection: "row", gap: 14 },
  link: { color: "#1D4ED8", fontWeight: "600" },
  remove: { color: "#DC2626" },
  cardField: { height: 50, marginVertical: 8 },
  btn: { backgroundColor: "#1D4ED8", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 12 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700" },
  err: { color: "#DC2626", marginTop: 12 },
});
