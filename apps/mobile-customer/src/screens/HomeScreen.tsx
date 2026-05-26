/**
 * HomeScreen — trip booking: origin/destination, category picker, estimate, confirm.
 * Sprint 27 — Application mobile customer
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
import { RootStackParamList } from "../navigation/AppNavigator";
import CategoryPicker from "../components/CategoryPicker";
import PromoInput from "../components/PromoInput";

interface Props {
  token: string;
}

type HomeNavProp = NativeStackNavigationProp<RootStackParamList, "Home">;

export default function HomeScreen({ token }: Props): React.ReactElement {
  const navigation = useNavigation<HomeNavProp>();
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCategories(token)
      .then(setCategories)
      .catch(() => {});
  }, [token]);

  const handleEstimate = async () => {
    setLoading(true);
    setError(null);
    try {
      const est = await getEstimate(token, 5.32, -4.02, 5.36, -3.98, selectedCategory);
      setEstimate(est);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async () => {
    if (!estimate) return;
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
      <Text style={styles.heading}>Réserver un trajet</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <CategoryPicker
        categories={categories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />
      <TouchableOpacity style={styles.button} onPress={handleEstimate} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Obtenir un tarif</Text>}
      </TouchableOpacity>
      {estimate && (
        <View style={styles.estimateBox}>
          <Text style={styles.price}>{estimate.price_xof} XOF</Text>
          <Text style={styles.detail}>
            {estimate.distance_km} km · ~{estimate.duration_min} min
          </Text>
          <PromoInput token={token} estimateId={estimate.estimate_id} />
          <TouchableOpacity style={[styles.button, styles.confirmButton]} onPress={handleBook}>
            <Text style={styles.buttonText}>Confirmer la réservation</Text>
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
