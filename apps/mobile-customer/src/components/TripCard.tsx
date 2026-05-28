/**
 * TripCard — displays a single trip summary row.
 * Sprint 42 — formatUSD, en-US locale, paid badge, Pay Now button.
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { TripResponse } from "../api";

interface Props {
  trip: TripResponse;
  onPay?: () => void;
}

function formatUSD(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (n ?? 0) / 100
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending:     "#F59E0B",
  accepted:    "#3B82F6",
  in_progress: "#8B5CF6",
  completed:   "#16A34A",
  cancelled:   "#EF4444",
};

export default function TripCard({ trip, onPay }: Props): React.ReactElement {
  const color = STATUS_COLORS[trip.status] ?? "#6B7280";
  const isPaid = !!trip.paid_at;
  const canPay = trip.status === "completed" && !isPaid && !!onPay;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.price}>{formatUSD(trip.price_xof)}</Text>
        <Text style={[styles.status, { color }]}>{trip.status}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.date}>
          {new Date(trip.created_at).toLocaleDateString("en-US", {
            day: "2-digit", month: "short", year: "numeric",
          })}
        </Text>
        {isPaid && (
          <View style={styles.paidBadge}>
            <Text style={styles.paidBadgeText}>💳 Paid</Text>
          </View>
        )}
      </View>
      {canPay && (
        <TouchableOpacity style={styles.payBtn} onPress={onPay} activeOpacity={0.8}>
          <Text style={styles.payBtnText}>💳 Pay Now</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  price: { fontWeight: "bold", fontSize: 16 },
  status: { fontWeight: "600", fontSize: 14 },
  date: { color: "#9CA3AF", fontSize: 13 },
  paidBadge: {
    backgroundColor: "#DCFCE7",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  paidBadgeText: { color: "#16A34A", fontSize: 12, fontWeight: "600" },
  payBtn: {
    marginTop: 8,
    backgroundColor: "#F97316",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  payBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
