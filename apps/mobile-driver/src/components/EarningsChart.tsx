/**
 * EarningsChart — minimal bar chart built with React Native View primitives.
 * No third-party chart library required.
 * Sprint 28 — Application mobile driver
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  todayXof: number;
  weekXof: number;
  totalXof: number;
}

interface BarProps {
  label: string;
  value: number;
  maxValue: number;
  color: string;
}

function Bar({ label, value, maxValue, color }: BarProps): React.ReactElement {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <View style={barStyles.container}>
      <Text style={barStyles.label}>{label}</Text>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={barStyles.value}>{value.toLocaleString()} XOF</Text>
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { marginBottom: 10 },
  label: { fontSize: 12, color: "#6B7280", marginBottom: 4 },
  track: {
    height: 12,
    backgroundColor: "#E5E7EB",
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 2,
  },
  fill: { height: "100%", borderRadius: 6 },
  value: { fontSize: 12, color: "#374151", textAlign: "right" },
});

export default function EarningsChart({ todayXof, weekXof, totalXof }: Props): React.ReactElement {
  const max = Math.max(totalXof, 1);
  return (
    <View style={styles.container}>
      <Bar label="Aujourd'hui" value={todayXof} maxValue={max} color="#60A5FA" />
      <Bar label="Cette semaine" value={weekXof} maxValue={max} color="#3B82F6" />
      <Bar label="Total" value={totalXof} maxValue={max} color="#1D4ED8" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F8FAFF",
    borderRadius: 10,
    padding: 14,
    marginVertical: 12,
  },
});
