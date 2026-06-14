/**
 * PromoInput — promo code input with apply button.
 * Sprint 27 — Application mobile customer
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { applyPromo, PromoResponse } from "../api";

interface Props {
  token: string;
  estimateId: string;
}

export default function PromoInput({ token, estimateId }: Props): React.ReactElement {
  const [code, setCode] = useState("");
  const [promo, setPromo] = useState<PromoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!code.trim()) return;
    setError(null);
    try {
      const result = await applyPromo(token, code.trim(), estimateId);
      setPromo(result);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <View style={styles.container}>
      {promo ? (
        <Text style={styles.success}>
          Code appliqué ! Remise : {promo.discount_cents} XOF → {promo.final_price_cents} XOF
        </Text>
      ) : (
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="Code promo"
            autoCapitalize="characters"
          />
          <TouchableOpacity style={styles.button} onPress={handleApply}>
            <Text style={styles.buttonText}>Appliquer</Text>
          </TouchableOpacity>
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 8 },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  button: {
    backgroundColor: "#F97316",
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontWeight: "bold" },
  success: { color: "#16A34A", fontWeight: "600" },
  error: { color: "red", marginTop: 4 },
});
