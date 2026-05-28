/**
 * DispatchScreen — lists available trips and assistance sorted by proximity.
 * Sprint 37 — uses useAuth() instead of props.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useDispatch } from "../hooks/useDispatch";
import { useAuth } from "../context/AuthContext";
import TripDispatchCard from "../components/TripDispatchCard";
import AssistanceDispatchCard from "../components/AssistanceDispatchCard";
import { TripResponse, AssistanceResponse, acceptTrip, acceptAssistance } from "../api";

type DispatchNavProp = NativeStackNavigationProp<RootStackParamList, "Dispatch">;

export default function DispatchScreen(): React.ReactElement {
  const { token, isOnline, setOnline } = useAuth();
  const navigation = useNavigation<DispatchNavProp>();
  const { trips, assistance, loading, error } = useDispatch(isOnline ? token : null);
  const [accepting, setAccepting] = useState(false);

  const handleAcceptTrip = async (trip: TripResponse) => {
    if (!token) return;
    setAccepting(true);
    try {
      const accepted = await acceptTrip(token, trip.trip_id);
      navigation.navigate("ActiveTrip", { tripId: accepted.trip_id });
    } catch (e: any) {
      // Show error — silent for now
    } finally {
      setAccepting(false);
    }
  };

  const handleAcceptAssistance = async (req: AssistanceResponse) => {
    if (!token) return;
    setAccepting(true);
    try {
      await acceptAssistance(token, req.request_id);
      navigation.navigate("ActiveTrip", { tripId: req.request_id });
    } catch {
      // silent
    } finally {
      setAccepting(false);
    }
  };

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
          data={[
            ...trips.map((t) => ({ type: "trip" as const, data: t })),
            ...assistance.map((a) => ({ type: "assistance" as const, data: a })),
          ]}
          keyExtractor={(item) =>
            item.type === "trip" ? item.data.trip_id : item.data.request_id
          }
          renderItem={({ item }) =>
            item.type === "trip" ? (
              <TripDispatchCard
                trip={item.data}
                onAccept={() => handleAcceptTrip(item.data)}
                disabled={accepting}
              />
            ) : (
              <AssistanceDispatchCard
                request={item.data}
                onAccept={() => handleAcceptAssistance(item.data)}
                disabled={accepting}
              />
            )
          }
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
});
