/**
 * WalletScreen — customer wallet: balance, top-up, transaction history.
 * Sprint 67 — mobile parity with the web-customer wallet (Sprint 33 backend).
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Linking,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import {
  getWallet, topupWallet, getWalletTransactions,
  Wallet, WalletTransaction,
} from "../api";

function formatUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((n ?? 0) / 100);
}

const TX_ICONS: Record<string, string> = { credit: "⬆️", debit: "⬇️", refund: "↩️" };
const TX_COLORS: Record<string, string> = { credit: "#16A34A", debit: "#DC2626", refund: "#2563EB" };

export default function WalletScreen(): React.ReactElement {
  const { token } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [topping, setTopping] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupSuccess, setTopupSuccess] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true); setError(null);
    Promise.all([getWallet(token), getWalletTransactions(token, 20)])
      .then(([w, t]) => { setWallet(w); setTxs(t); })
      .catch((e) => setError(e?.message || "Could not load wallet."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleTopup = async () => {
    const amt = Number(amount);
    if (!token || !amt || amt <= 0 || topping) return;
    setTopping(true); setTopupError(null); setTopupSuccess(null);
    try {
      // WS2: top-up is a real payment. Open the checkout; the wallet is credited
      // only once the provider confirms (webhook).
      const result = await topupWallet(token, amt);
      setAmount("");
      if (result.checkout_url && !result.checkout_url.includes("localhost")) {
        Linking.openURL(result.checkout_url).catch(() => {});
        setTopupSuccess("Opening payment — your wallet will be credited once the payment is confirmed.");
      } else {
        setTopupSuccess("Top-up initiated. Your wallet will be credited once the payment is confirmed.");
      }
      load();  // refresh; the credit appears after confirmation
    } catch (e: any) {
      setTopupError(e?.message || "Top-up failed.");
    } finally {
      setTopping(false);
    }
  };

  if (loading && !wallet) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>💰 My Wallet</Text>
      {error && <Text style={styles.err}>{error}</Text>}

      {wallet && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>{formatUSD(wallet.balance_cents)}</Text>
        </View>
      )}

      <Text style={styles.subtitle}>Top Up Your Wallet</Text>
      {topupError && <Text style={styles.err}>{topupError}</Text>}
      {topupSuccess && <Text style={styles.success}>{topupSuccess}</Text>}
      <View style={styles.formRow}>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          placeholder="Amount in cents (100 = $1.00)"
        />
        <TouchableOpacity
          style={[styles.topupBtn, topping && styles.topupBtnDisabled]}
          onPress={handleTopup}
          disabled={topping}
        >
          <Text style={styles.topupText}>{topping ? "…" : "Top Up"}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.note}>💳 Apple Pay · Google Pay · Credit / Debit Card</Text>

      <Text style={styles.subtitle}>Transaction History</Text>
      {txs.length === 0 && <Text style={styles.empty}>No transactions yet.</Text>}
      {txs.map((tx) => (
        <View key={tx.tx_id} style={styles.txRow}>
          <Text style={styles.txIcon}>{TX_ICONS[tx.tx_type] ?? "•"}</Text>
          <View style={styles.txDetails}>
            <Text style={styles.txReason}>{tx.reason.replace(/_/g, " ")}</Text>
            {tx.reference_id ? (
              <Text style={styles.txRef}>#{tx.reference_id.slice(-8)}</Text>
            ) : null}
          </View>
          <Text style={[styles.txAmount, { color: TX_COLORS[tx.tx_type] ?? "#111827" }]}>
            {tx.tx_type === "debit" ? "−" : "+"}{formatUSD(tx.amount_cents)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 16, color: "#111827" },
  balanceCard: {
    backgroundColor: "#F97316",
    borderRadius: 14,
    padding: 22,
    alignItems: "center",
    marginBottom: 18,
  },
  balanceLabel: { color: "#FFEDD5", fontSize: 13 },
  balanceAmount: { color: "#fff", fontSize: 34, fontWeight: "bold" },
  subtitle: { fontSize: 16, fontWeight: "700", marginTop: 18, marginBottom: 8, color: "#111827" },
  formRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  topupBtn: {
    backgroundColor: "#F97316",
    borderRadius: 8,
    paddingHorizontal: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  topupBtnDisabled: { opacity: 0.5 },
  topupText: { color: "#fff", fontWeight: "700" },
  note: { fontSize: 12, color: "#9CA3AF", marginTop: 8 },
  err: { color: "#EF4444", fontSize: 13, marginTop: 6 },
  success: { color: "#16A34A", fontSize: 13, marginTop: 6 },
  empty: { color: "#9CA3AF", fontSize: 13, textAlign: "center", marginTop: 8 },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 8,
  },
  txIcon: { fontSize: 18, marginRight: 10 },
  txDetails: { flex: 1 },
  txReason: { fontSize: 14, fontWeight: "600", color: "#111827", textTransform: "capitalize" },
  txRef: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "700" },
});
