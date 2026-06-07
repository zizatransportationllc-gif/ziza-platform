/**
 * DispatchScreen — lists available trips sorted by proximity.
 * Sprint 48 — removed Assistance dispatch.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useDispatch } from "../hooks/useDispatch";
import { useAuth } from "../context/AuthContext";
import TripDispatchCard from "../components/TripDispatchCard";
import { TripResponse, acceptTrip } from "../api";

type DispatchNavProp = NativeStackNavigationProp<RootStackParamList, "Dispatch">;

export default function DispatchScreen(): React.ReactElement {
  const { token, isOnline, setOnline, driverStatus } = useAuth();
  const navigation = useNavigation<DispatchNavProp>();
  const { trips, loading, error } = useDispatch(isOnline && driverStatus === "active" ? token : null);
  const [accepting, setAccepting] = useState(false);

  const handleAcceptTrip = async (trip: TripResponse) => {
    if (!token) return;
    setAccepting(true);
    try {
      const accepted = await acceptTrip(token, trip.trip_id);
      navigation.navigate("ActiveTrip", { tripId: accepted.trip_id });
    } catch {
      // silent
    } finally {
      setAccepting(false);
    }
  };

  // Sprint 54 — KYC gate: block dispatch until docs are validated
  if (driverStatus === "pending_docs") {
    return (
      <View style={styles.container}>
        <View style={styles.kycBanner}>
          <Text style={styles.kycIcon}>🔒</Text>
          <Text style={styles.kycTitle}>Account Pending Verification</Text>
          <Text style={styles.kycBody}>
            Submit your KYC documents to unlock the trip marketplace.
            An admin will review and activate your account.
          </Text>
          <Text
            style={styles.kycLink}
            onPress={() => navigation.navigate("Documents")}
          >
            📄 Go to Documents →
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.onlineRow}>
        <Text style={styles.onlineLabel}>
          {isOnline ? "🟢 Online" : "⚫ Offline"}
        </Text>
        <Switch
          value={isOnline}
          onValueChange={setOnline}
          trackColor={{ true: "#1D4ED8" }}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator size="large" color="#1D4ED8" style={{ marginTop: 40 }} />
      ) : !isOnline ? (
        <Text style={styles.offlineMsg}>
          Go online to receive trips.
        </Text>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.trip_id}
          renderItem={({ item }) => (
            <TripDispatchCard
              trip={item}
              onAccept={() => handleAcceptTrip(item)}
              disabled={accepting}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No trips available.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  onlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  onlineLabel: { fontSize: 16, fontWeight: "600" },
  offlineMsg: { textAlign: "center", color: "#6B7280", marginTop: 60, fontSize: 16 },
  empty: { textAlign: "center", color: "#9CA3AF", marginTop: 40 },
  errorText: { color: "#EF4444", textAlign: "center", marginTop: 8, fontSize: 13 },
  // Sprint 54 — KYC pending
  kycBanner: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  kycIcon: { fontSize: 48, marginBottom: 16 },
  kycTitle: { fontSize: 20, fontWeight: "700", color: "#1E3A5F", marginBottom: 12, textAlign: "center" },
  kycBody: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 22, marginBottom: 24 },
  kycLink: { fontSize: 15, fontWeight: "700", color: "#1D4ED8", textDecorationLine: "underline" },
});
