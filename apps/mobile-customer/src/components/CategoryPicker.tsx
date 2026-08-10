/**
 * CategoryPicker — horizontal scroll list of vehicle categories.
 * Sprint 27 — Application mobile customer
 */
import React from "react";
import { ScrollView, TouchableOpacity, Text, StyleSheet } from "react-native";
import { CategoryInfo } from "../api";

interface Props {
  categories: CategoryInfo[];
  selected: string | undefined;
  onSelect: (categoryId: string) => void;
}

export default function CategoryPicker({
  categories,
  selected,
  onSelect,
}: Props): React.ReactElement {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.container}>
      {categories.map((cat, index) => (
        <TouchableOpacity
          key={`${cat.category_id ?? "cat"}-${index}`}
          style={[styles.chip, selected === cat.category_id && styles.chipSelected]}
          onPress={() => onSelect(cat.category_id)}
        >
          <Text style={[styles.chipText, selected === cat.category_id && styles.chipTextSelected]}>
            {cat.name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: "#1D4ED8",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipSelected: { backgroundColor: "#1D4ED8" },
  chipText: { color: "#1D4ED8", fontWeight: "600" },
  chipTextSelected: { color: "#fff" },
});
