/**
 * StarPicker — 1-5 star rating selector.
 * Sprint 27 — Application mobile customer
 */
import React, { useState } from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";

interface Props {
  onRate: (stars: number) => void;
  initial?: number;
}

export default function StarPicker({ onRate, initial = 0 }: Props): React.ReactElement {
  const [rating, setRating] = useState(initial);

  const handlePress = (stars: number) => {
    setRating(stars);
    onRate(stars);
  };

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => handlePress(star)}>
          <Text style={[styles.star, star <= rating && styles.starFilled]}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", justifyContent: "center", marginVertical: 8 },
  star: { fontSize: 32, color: "#D1D5DB", marginHorizontal: 4 },
  starFilled: { color: "#1D4ED8" },
});
