/**
 * WithdrawalsScreen — professional balance-capped withdrawals.
 * Sprint 67 — Ziza Craft.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import {
  getProBalance, createProPayout, listProPayouts,
  ProBalance, ProPayoutRecord, formatUSD,
} from "../api";

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: "⏳ Pending",
  approved: "✅ Approved",
  rejected: "✗ Rejected",
  processed: "💸 Paid",
  failed: "⚠ Failed",
};

export default function WithdrawalsScreen(): React.ReactElement {
  const { token } = useAuth();
  const [balance, setBalance] = useState<ProBalance | null>(null);
  const [payouts, setPayouts] = useState<ProPayoutRecord[]>([]);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      getProBalance(token).then(setBalance).catch(() => {}),
      listProPayouts(token).then(setPayouts).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const available = balance?.disponible_cents ?? null;
  const amountNum = Number(amount);
  const overBalance = available != null && amountNum > available;

  const handleSubmit = async () => {
    if (!token || !amountNum || amountNum <= 0 || submitting) return;
    if (overBalance) { setError("Amount exceeds your available balance."); return; }
    setSubmitting(true); setError(null); setSuccess(null);
    try {
      await createProPayout(token, amountNum);
      setAmount("");
      setSuccess("Withdrawal request submitted!");
      load();
    } catch (e: any) {
      setError(e?.message || "Could not submit withdrawal.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !balance) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>💰 Withdrawals</Text>

      {available != null && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available to withdraw</Text>
          <Text style={styles.balanceAmount}>{formatUSD(available)}</Text>
        </View>
      )}

      <View style={styles.formRow}>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          placeholder="Amount in cents (e.g. 5000 = $50)"
        />
        <TouchableOpacity
          style={[styles.submitBtn, (submitting || overBalance || !available) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || overBalance || !available}
        >
          <Text style={styles.submitText}>{submitting ? "…" : "Request"}</Text>
        </TouchableOpacity>
      </View>
      {overBalance && <Text style={styles.err}>Amount exceeds your available balance.</Text>}
      {error && <Text style={styles.err}>{error}</Text>}
      {success && <Text style={styles.success}>{success}</Text>}

      <Text style={styles.listTitle}>History</Text>
      {payouts.length === 0 && <Text style={styles.empty}>No withdrawal requests yet.</Text>}
      {payouts.map((p) => (
        <View key={p.payout_id} style={styles.payoutRow}>
          <View>
            <Text style={styles.payoutAmount}>{formatUSD(p.amount_cents)}</Text>
            {p.note_admin ? <Text style={styles.payoutNote}>💬 {p.note_admin}</Text> : null}
          </View>
          <Text style={styles.payoutStatus}>{PAYOUT_STATUS_LABELS[p.status] ?? p.status}</Text>
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
    backgroundColor: "#059669",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  balanceLabel: { color: "#D1FAE5", fontSize: 13 },
  balanceAmount: { color: "#fff", fontSize: 32, fontWeight: "bold" },
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
  submitBtn: {
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "700" },
  err: { color: "#EF4444", fontSize: 13, marginTop: 8 },
  success: { color: "#16A34A", fontSize: 13, marginTop: 8 },
  listTitle: { fontSize: 16, fontWeight: "700", marginTop: 22, marginBottom: 8, color: "#111827" },
  empty: { color: "#9CA3AF", fontSize: 13, textAlign: "center", marginTop: 8 },
  payoutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginBottom: 8,
  },
  payoutAmount: { fontSize: 16, fontWeight: "600", color: "#111827" },
  payoutNote: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  payoutStatus: { fontSize: 14, color: "#6B7280" },
});
