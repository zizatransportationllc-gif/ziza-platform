/**
 * PlacesScreen — autocomplete address search for origin/destination.
 * Sprint 35
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/AppNavigator";
import { searchPlaces, PlaceResult } from "../api";
import { useAuth } from "../context/AuthContext";

type PlacesRouteProp = RouteProp<RootStackParamList, "Places">;

export default function PlacesScreen(): React.ReactElement {
  const { token } = useAuth();
  const navigation = useNavigation();
  const route = useRoute<PlacesRouteProp>();
  const { onSelect } = route.params;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.length < 3) { setResults([]); return; }
    if (!token) return;
    setLoading(true);
    try {
      const places = await searchPlaces(token, text);
      setResults(places);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (place: PlaceResult) => {
    onSelect({ lat: place.lat, lng: place.lng, name: place.name });
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={handleSearch}
        placeholder="Search address…"
        autoFocus
      />
      {loading && <ActivityIndicator color="#1D4ED8" style={{ marginVertical: 8 }} />}
      <FlatList
        data={results}
        keyExtractor={(item) => item.place_id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.result} onPress={() => handleSelect(item)}>
            <Text style={styles.resultPin}>📍</Text>
            <View style={styles.resultText}>
              <Text style={styles.resultName} numberOfLines={1}>{item.primary ?? item.name}</Text>
              {!!item.secondary && (
                <Text style={styles.resultAddress} numberOfLines={1}>{item.secondary}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  result: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  resultPin: { fontSize: 16, opacity: 0.7 },
  resultText: { flex: 1, minWidth: 0 },
  resultName: { fontSize: 15, fontWeight: "600" },
  resultAddress: { fontSize: 13, color: "#6B7280", marginTop: 1 },
});
