/**
 * WithdrawalsScreen — professional balance-capped withdrawals.
 * Sprint 67 — Ziza Craft.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import {
  getProBalance, listProPayouts,
  getConnectStatus, connectOnboard,
  getIssuingCard, issueIssuingCard, setIssuingCardStatus,
  ProBalance, ProPayoutRecord, ConnectStatus, IssuingCard, formatUSD,
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
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [card, setCard] = useState<IssuingCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      getProBalance(token).then(setBalance).catch(() => {}),
      listProPayouts(token).then(setPayouts).catch(() => {}),
      getConnectStatus(token).then(setConnect).catch(() => {}),
      getIssuingCard(token).then(setCard).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const payoutsReady = connect?.payouts_enabled ?? false;
  const handleOnboard = async () => {
    if (!token) return;
    try {
      const r = await connectOnboard(token);
      if (r.onboarding_url) Linking.openURL(r.onboarding_url).catch(() => {});
    } catch { /* ignore */ }
  };

  const cardBalance = balance?.connect_available_cents ?? null;

  const handleIssue = async () => {
    if (!token) return;
    setBusy(true); setError(null);
    try { setCard(await issueIssuingCard(token)); }
    catch (e: any) { setError(e?.message || "Could not issue card."); }
    finally { setBusy(false); }
  };
  const handleToggle = async () => {
    if (!token || !card) return;
    setBusy(true); setError(null);
    try { setCard(await setIssuingCardStatus(token, card.status !== "active")); }
    catch (e: any) { setError(e?.message || "Could not update card."); }
    finally { setBusy(false); }
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
      <Text style={styles.heading}>💳 Payouts & Card</Text>

      <View style={styles.zizaCard}>
        <Text style={styles.zizaCardLabel}>Ziza debit card</Text>
        {card ? (
          <>
            <Text style={styles.zizaCardNumber}>•••• •••• •••• {card.last4 ?? "••••"}</Text>
            <View style={styles.zizaCardFooter}>
              <Text style={styles.zizaCardStatus}>{card.status === "active" ? "🟢 Active" : "⏸️ Frozen"}</Text>
              <TouchableOpacity style={styles.submitBtn} onPress={handleToggle} disabled={busy}>
                <Text style={styles.submitText}>{card.status === "active" ? "Freeze" : "Unfreeze"}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.zizaCardHint}>Get a card to spend your earnings instantly.</Text>
            <TouchableOpacity style={styles.submitBtn} onPress={handleIssue} disabled={busy}>
              <Text style={styles.submitText}>{busy ? "Issuing…" : "Get my card"}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {cardBalance != null && (
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available on your card</Text>
          <Text style={styles.balanceAmount}>{formatUSD(cardBalance)}</Text>
        </View>
      )}

      {connect && !payoutsReady && (
        <TouchableOpacity style={styles.onboardBanner} onPress={handleOnboard}>
          <Text style={styles.onboardText}>⚠️ Set up your payout account to get paid →</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.autoNote}>
        Your bid is paid automatically to your Ziza balance and spendable with your
        debit card — no manual withdrawal needed.
      </Text>
      {error && <Text style={styles.err}>{error}</Text>}

      {payouts.length > 0 && <Text style={styles.listTitle}>Past withdrawals</Text>}
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
  // Sprint 70 — Ziza debit card
  zizaCard: { backgroundColor: "#111827", borderRadius: 12, padding: 16, marginBottom: 14 },
  zizaCardLabel: { color: "#9CA3AF", fontSize: 13 },
  zizaCardNumber: { color: "#fff", fontSize: 20, letterSpacing: 2, marginVertical: 8 },
  zizaCardHint: { color: "#D1D5DB", fontSize: 13, marginVertical: 8 },
  zizaCardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  zizaCardStatus: { color: "#D1D5DB", fontSize: 12, textTransform: "uppercase" },
  autoNote: { fontSize: 13, color: "#6B7280", marginVertical: 8 },
  onboardBanner: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FCD34D", borderRadius: 8, padding: 12, marginBottom: 14 },
  onboardText: { color: "#92400E", fontSize: 13, fontWeight: "600" },
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
