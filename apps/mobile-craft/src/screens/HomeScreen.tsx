/**
 * HomeScreen — professional sees nearby open craft requests.
 * Sprint 47 — Ziza Craft.
 *
 * Fetches current GPS position then loads requests sorted by proximity.
 * Pull-to-refresh reloads with fresh position.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  RefreshControl,
} from "react-native";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import {
  listOpenCraftRequests,
  updateProfessionalProfile,
  CraftRequest,
  formatUSD,
} from "../api";
import { useAuth } from "../context/AuthContext";

type HomeNavProp = NativeStackNavigationProp<RootStackParamList, "Home">;

export default function HomeScreen(): React.ReactElement {
  const { token, profile, refreshProfile } = useAuth();
  const navigation = useNavigation<HomeNavProp>();
  const [requests, setRequests] = useState<CraftRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);

  const getPosition = async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      return null;
    }
  };

  const loadRequests = useCallback(async (showLoader = true) => {
    if (!token) return;
    if (showLoader) setLoading(true);
    setError(null);
    try {
      const pos = await getPosition();
      const lat = pos?.lat ?? 40.7357;  // fallback: Newark NJ
      const lng = pos?.lng ?? -74.1724;
      setMyLat(lat);
      setMyLng(lng);
      const items = await listOpenCraftRequests(token, lat, lng);
      setRequests(items);
    } catch (e: any) {
      setError(e.message || "Failed to load requests");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleToggleOnline = async (value: boolean) => {
    if (!token) return;
    try {
      await updateProfessionalProfile(token, { is_online: value });
      await refreshProfile();
    } catch {
      // silent
    }
  };

  const renderRequest = ({ item }: { item: CraftRequest }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate("RequestDetail", { requestId: item.request_id })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.category}>{item.category.toUpperCase()}</Text>
        {item.distance_km != null && (
          <Text style={styles.distance}>{item.distance_km.toFixed(1)} km away</Text>
        )}
      </View>
      <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
      {item.address ? (
        <Text style={styles.address} numberOfLines={1}>📍 {item.address}</Text>
      ) : null}
      {item.bid_deadline ? (
        <Text style={styles.deadline}>
          ⏱ Bidding closes: {new Date(item.bid_deadline).toLocaleTimeString()}
        </Text>
      ) : null}
      <TouchableOpacity
        style={styles.bidButton}
        onPress={() => navigation.navigate("RequestDetail", { requestId: item.request_id })}
      >
        <Text style={styles.bidButtonText}>View & Bid</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const isOnline = profile?.is_online ?? false;
  const profStatus = profile?.status ?? "active"; // Sprint 54

  // Sprint 54 — KYC gate: block requests until professional docs are validated
  if (profStatus === "pending_docs") {
    return (
      <View style={styles.container}>
        <View style={styles.kycBanner}>
          <Text style={styles.kycIcon}>🔒</Text>
          <Text style={styles.kycTitle}>Account Pending Verification</Text>
          <Text style={styles.kycBody}>
            Submit your professional documents to unlock client requests.
            An admin will review and activate your account.
          </Text>
          <Text
            style={styles.kycLink}
            onPress={() => navigation.navigate("Profile")}
          >
            📄 Go to Profile → Documents →
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Online toggle */}
      <View style={styles.onlineRow}>
        <Text style={styles.onlineLabel}>
          {isOnline ? "🟢 Available" : "⚫ Offline"}
        </Text>
        <Switch
          value={isOnline}
          onValueChange={handleToggleOnline}
          trackColor={{ true: "#059669" }}
        />
      </View>

      {/* Nav row */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => navigation.navigate("MyBids")}
        >
          <Text style={styles.navBtnText}>My Bids</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text style={styles.navBtnText}>Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => navigation.navigate("Withdrawals")}
        >
          <Text style={styles.navBtnText}>💰 Withdraw</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator size="large" color="#059669" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.request_id}
          renderItem={renderRequest}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadRequests(false);
              }}
              tintColor="#059669"
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {isOnline
                ? "No open requests nearby."
                : "Go available to see nearby requests."}
            </Text>
          }
          contentContainerStyle={styles.list}
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
  navRow: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  navBtn: {
    flex: 1,
    backgroundColor: "#ECFDF5",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  navBtnText: { color: "#059669", fontWeight: "600", fontSize: 14 },
  list: { padding: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  category: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  distance: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  description: { fontSize: 15, color: "#111827", marginBottom: 6 },
  address: { fontSize: 12, color: "#6B7280", marginBottom: 4 },
  deadline: { fontSize: 12, color: "#D97706", marginBottom: 8 },
  bidButton: {
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  bidButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  empty: { textAlign: "center", color: "#9CA3AF", marginTop: 60, fontSize: 16 },
  errorText: { color: "#EF4444", textAlign: "center", marginTop: 8, fontSize: 13, padding: 12 },
  // Sprint 54 — KYC pending
  kycBanner: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  kycIcon: { fontSize: 48, marginBottom: 16 },
  kycTitle: { fontSize: 20, fontWeight: "700", color: "#065f46", marginBottom: 12, textAlign: "center" },
  kycBody: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 22, marginBottom: 24 },
  kycLink: { fontSize: 15, fontWeight: "700", color: "#059669", textDecorationLine: "underline" },
});
