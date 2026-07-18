/**
 * PaymentScreen — checkout WebView + return-URL interception + status polling.
 * Sprint 41 — intercepts the CinetPay return URL and polls the API until the
 *             payment status is terminal (paid / failed).
 *
 * Flow:
 *   1. WebView loads the checkout URL (CinetPay or mock).
 *   2. Provider redirects to payment_return_url after the transaction.
 *   3. We intercept that URL, stop the WebView and start polling.
 *   4. Once status is terminal, show an inline success or failure card.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import { getTripPayment, PaymentIntentResponse } from "../api";

type PaymentRouteProp = RouteProp<RootStackParamList, "Payment">;
type PaymentNavProp = NativeStackNavigationProp<RootStackParamList, "Payment">;

// URL prefix that CinetPay (and mock) redirect to after payment
const RETURN_URL_PREFIX = "https://app.ziza.ci/payment/return";
// For mock adapter (localhost URL), simulate an immediate success
const MOCK_URL_PREFIX = "http://localhost/mock-pay";

// Poll interval (ms) and max attempts
const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 16; // ~40 seconds

type PaymentState = "checkout" | "polling" | "paid" | "failed" | "timeout";

function formatUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((n ?? 0) / 100);
}

export default function PaymentScreen(): React.ReactElement {
  const { token } = useAuth();
  const route = useRoute<PaymentRouteProp>();
  const navigation = useNavigation<PaymentNavProp>();
  const { tripId, checkoutUrl } = route.params;

  const [payState, setPayState] = useState<PaymentState>("checkout");
  const [amountXof, setAmountXof] = useState<number | null>(null);
  const [intent, setIntent] = useState<PaymentIntentResponse | null>(null);

  // Fetch the payment intent once so we can show the price breakdown (Sprint 70).
  useEffect(() => {
    if (!token) return;
    getTripPayment(token, tripId)
      .then((d) => { if (d) setIntent(d); })
      .catch(() => { /* ignore — breakdown is best-effort */ });
  }, [token, tripId]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (!token) return;
    setPayState("polling");
    attemptsRef.current = 0;

    pollRef.current = setInterval(async () => {
      attemptsRef.current += 1;
      try {
        const intent = await getTripPayment(token, tripId);
        if (intent) {
          setAmountXof(intent.amount_cents);
          if (intent.status === "paid") {
            stopPolling();
            setPayState("paid");
            return;
          }
          if (intent.status === "failed") {
            stopPolling();
            setPayState("failed");
            return;
          }
        }
      } catch {
        // Network error — keep polling
      }
      if (attemptsRef.current >= MAX_POLL_ATTEMPTS) {
        stopPolling();
        setPayState("timeout");
      }
    }, POLL_INTERVAL_MS);
  }, [token, tripId, stopPolling]);

  /** Intercept navigation events in the WebView. */
  const handleNavigationChange = useCallback(
    (event: WebViewNavigation) => {
      const url = event.url;
      // CinetPay return URL — payment page closed
      if (url.startsWith(RETURN_URL_PREFIX)) {
        startPolling();
        return false; // block WebView from loading the return URL
      }
      // Mock checkout: auto-simulate success for dev builds
      if (url.startsWith(MOCK_URL_PREFIX)) {
        startPolling();
        return false;
      }
      return true;
    },
    [startPolling],
  );

  // ---- Result cards --------------------------------------------------------

  if (payState === "polling") {
    return (
      <View style={styles.resultContainer}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.pollingText}>Verifying payment…</Text>
        <Text style={styles.pollingHint}>
          This usually takes a few seconds.
        </Text>
      </View>
    );
  }

  if (payState === "paid") {
    return (
      <View style={styles.resultContainer}>
        <Text style={styles.resultIcon}>✅</Text>
        <Text style={styles.resultTitle}>Payment confirmed!</Text>
        {amountXof != null && (
          <Text style={styles.resultAmount}>{formatUSD(amountXof)}</Text>
        )}
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.navigate("Main")}
        >
          <Text style={styles.doneText}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (payState === "failed") {
    return (
      <View style={styles.resultContainer}>
        <Text style={styles.resultIcon}>❌</Text>
        <Text style={styles.resultTitle}>Payment failed</Text>
        <Text style={styles.resultHint}>
          The payment did not go through. Please check your balance and try again.
        </Text>
        <TouchableOpacity
          style={[styles.doneButton, styles.retryButton]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.doneText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (payState === "timeout") {
    return (
      <View style={styles.resultContainer}>
        <Text style={styles.resultIcon}>⏱️</Text>
        <Text style={styles.resultTitle}>Still processing</Text>
        <Text style={styles.resultHint}>
          The payment is still being processed. Check your trip history for the final status.
        </Text>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.navigate("History")}
        >
          <Text style={styles.doneText}>View my trips</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---- WebView checkout ---------------------------------------------------

  const showBreakdown = intent != null && intent.base_cents != null;

  return (
    <View style={styles.container}>
      {showBreakdown && (
        <View style={styles.breakdown}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Base</Text>
            <Text style={styles.breakdownLabel}>{formatUSD(intent!.base_cents)}</Text>
          </View>
          {intent!.platform_fee_cents != null && (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Service fee</Text>
              <Text style={styles.breakdownLabel}>{formatUSD(intent!.platform_fee_cents)}</Text>
            </View>
          )}
          {intent!.tax_cents != null && (
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Tax</Text>
              <Text style={styles.breakdownLabel}>{formatUSD(intent!.tax_cents)}</Text>
            </View>
          )}
          <View style={[styles.breakdownRow, styles.breakdownTotalRow]}>
            <Text style={styles.breakdownTotal}>Total</Text>
            <Text style={styles.breakdownTotal}>{formatUSD(intent!.amount_cents)}</Text>
          </View>
        </View>
      )}
      <WebView
        source={{ uri: checkoutUrl }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#1D4ED8" />
          </View>
        )}
        javaScriptEnabled
        domStorageEnabled
        onShouldStartLoadWithRequest={handleNavigationChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  breakdown: { padding: 12, backgroundColor: "#F9FAFB", borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  breakdownLabel: { fontSize: 13, color: "#6B7280" },
  breakdownTotalRow: { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  breakdownTotal: { fontSize: 14, fontWeight: "700", color: "#111" },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  resultContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#fff",
  },
  resultIcon: { fontSize: 56, marginBottom: 16 },
  resultTitle: { fontSize: 22, fontWeight: "bold", color: "#111", marginBottom: 8, textAlign: "center" },
  resultAmount: { fontSize: 28, fontWeight: "700", color: "#1D4ED8", marginBottom: 24 },
  resultHint: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 24, lineHeight: 20 },
  pollingText: { fontSize: 18, fontWeight: "600", color: "#111", marginTop: 20, marginBottom: 8 },
  pollingHint: { fontSize: 13, color: "#888", textAlign: "center" },
  doneButton: {
    backgroundColor: "#1D4ED8",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 36,
    alignItems: "center",
    marginTop: 8,
  },
  retryButton: { backgroundColor: "#EF4444" },
  doneText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
