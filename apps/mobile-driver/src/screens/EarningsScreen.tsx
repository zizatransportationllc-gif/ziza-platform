/**
 * EarningsScreen — driver earnings dashboard + withdrawals.
 * Sprint 37 — uses useAuth() instead of props.
 * Sprint 67 — balance-capped withdrawal requests.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
  TextInput, TouchableOpacity,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import {
  getMyEarnings, EarningsResponse,
  getDriverBalance, createPayout, listPayouts,
  DriverBalance, PayoutRecord,
} from "../api";
import EarningsChart from "../components/EarningsChart";

function formatUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((n ?? 0) / 100);
}

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: "⏳ Pending",
  approved: "✅ Approved",
  rejected: "✗ Rejected",
  processed: "💸 Paid",
  failed: "⚠ Failed",
};

function WithdrawalCard({ token }: { token: string }): React.ReactElement {
  const [balance, setBalance] = useState<DriverBalance | null>(null);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(() => {
    getDriverBalance(token).then(setBalance).catch(() => {});
    listPayouts(token).then(setPayouts).catch(() => {});
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const available = balance?.disponible_cents ?? null;
  const amountNum = Number(amount);
  const overBalance = available != null && amountNum > available;

  const handleSubmit = async () => {
    if (!amountNum || amountNum <= 0 || submitting) return;
    if (overBalance) { setError("Amount exceeds your available balance."); return; }
    setSubmitting(true); setError(null); setSuccess(null);
    try {
      await createPayout(token, amountNum);
      setAmount("");
      setSuccess("Withdrawal request submitted!");
      load();
    } catch (e: any) {
      setError(e?.message || "Could not submit withdrawal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.withdrawCard}>
      <Text style={styles.sectionTitle}>💰 Withdrawals</Text>
      {available != null && (
        <Text style={styles.available}>
          Available to withdraw: <Text style={styles.availableStrong}>{formatUSD(available)}</Text>
        </Text>
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

      {payouts.map((p) => (
        <View key={p.payout_id} style={styles.payoutRow}>
          <Text style={styles.payoutAmount}>{formatUSD(p.amount_cents)}</Text>
          <Text style={styles.payoutStatus}>{PAYOUT_STATUS_LABELS[p.status] ?? p.status}</Text>
        </View>
      ))}
      {payouts.length === 0 && <Text style={styles.empty}>No withdrawal requests yet.</Text>}
    </View>
  );
}

export default function EarningsScreen(): React.ReactElement {
  const { token } = useAuth();
  const [earnings, setEarnings] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    getMyEarnings(token)
      .then(setEarnings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>My Earnings</Text>
      {earnings && (
        <>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total earned</Text>
            <Text style={styles.totalAmount}>{formatUSD(earnings.total_cents)}</Text>
            <Text style={styles.totalTrips}>{earnings.total_trips} trips</Text>
          </View>
          <EarningsChart
            todayXof={earnings.today_cents}
            weekXof={earnings.week_cents}
            totalXof={earnings.total_cents}
          />
          <View style={styles.row}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Today</Text>
              <Text style={styles.statValue}>{formatUSD(earnings.today_cents)}</Text>
              <Text style={styles.statSub}>{earnings.today_trips} trips</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>This week</Text>
              <Text style={styles.statValue}>{formatUSD(earnings.week_cents)}</Text>
              <Text style={styles.statSub}>{earnings.week_trips} trips</Text>
            </View>
          </View>
        </>
      )}
      {token && <WithdrawalCard token={token} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  totalCard: {
    backgroundColor: "#1D4ED8",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
  },
  totalLabel: { color: "#BFDBFE", fontSize: 13 },
  totalAmount: { color: "#fff", fontSize: 32, fontWeight: "bold" },
  totalTrips: { color: "#93C5FD", fontSize: 14, marginTop: 4 },
  row: { flexDirection: "row", gap: 12, marginTop: 16 },
  statBox: {
    flex: 1,
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  statLabel: { fontSize: 12, color: "#6B7280" },
  statValue: { fontSize: 18, fontWeight: "bold", color: "#1D4ED8" },
  statSub: { fontSize: 12, color: "#9CA3AF" },
  // Withdrawals
  withdrawCard: {
    marginTop: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10, color: "#111827" },
  available: { fontSize: 14, color: "#374151", marginBottom: 10 },
  availableStrong: { fontWeight: "700", color: "#1D4ED8" },
  formRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#F9FAFB",
  },
  submitBtn: {
    backgroundColor: "#1D4ED8",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "700" },
  err: { color: "#EF4444", fontSize: 13, marginTop: 8 },
  success: { color: "#16A34A", fontSize: 13, marginTop: 8 },
  payoutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  payoutAmount: { fontSize: 15, fontWeight: "600", color: "#111827" },
  payoutStatus: { fontSize: 14, color: "#6B7280" },
  empty: { color: "#9CA3AF", fontSize: 13, marginTop: 10, textAlign: "center" },
});
