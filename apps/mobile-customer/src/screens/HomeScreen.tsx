/**
 * HomeScreen — trip booking: category picker, estimate, confirm.
 * Sprint 35
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  listCategories,
  getEstimate,
  createTrip,
  CategoryInfo,
  EstimateResponse,
} from "../api";
import { useAuth } from "../context/AuthContext";
import { RootStackParamList } from "../navigation/AppNavigator";
import CategoryPicker from "../components/CategoryPicker";
import PromoInput from "../components/PromoInput";

type HomeNavProp = NativeStackNavigationProp<RootStackParamList, "Home">;

// Newark, NJ demo coords
const ORIGIN = { lat: 40.7357, lng: -74.1724 };
const DEST   = { lat: 40.7282, lng: -74.0776 };

export default function HomeScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation<HomeNavProp>();
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    listCategories(token).then(setCategories).catch(() => {});
  }, [token]);

  const handleEstimate = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const est = await getEstimate(
        token,
        ORIGIN.lat, ORIGIN.lng,
        DEST.lat,   DEST.lng,
        selectedCategory
      );
      setEstimate(est);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async () => {
    if (!token || !estimate) return;
    setLoading(true);
    try {
      const trip = await createTrip(token, estimate.estimate_id);
      navigation.navigate("Tracking", { tripId: trip.trip_id });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Book a Ride</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <CategoryPicker
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />
      <TouchableOpacity style={styles.button} onPress={handleEstimate} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Get Fare Estimate</Text>
        )}
      </TouchableOpacity>
      {estimate && (
        <View style={styles.estimateBox}>
          <Text style={styles.price}>${(estimate.price_xof / 100).toFixed(2)}</Text>
          <Text style={styles.detail}>
            {estimate.distance_km} km · ~{estimate.duration_min} min
          </Text>
          <PromoInput token={token!} estimateId={estimate.estimate_id} />
          <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={handleBook}>
            <Text style={styles.buttonText}>Confirm Booking</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  button: {
    backgroundColor: "#F97316",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginVertical: 8,
  },
  confirmButton: { backgroundColor: "#16A34A" },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  estimateBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  price: { fontSize: 28, fontWeight: "bold", color: "#F97316", textAlign: "center" },
  detail: { textAlign: "center", color: "#6B7280", marginBottom: 12 },
  error: { color: "red", marginBottom: 8 },
});
