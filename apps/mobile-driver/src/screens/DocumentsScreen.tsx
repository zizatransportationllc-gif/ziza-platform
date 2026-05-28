/**
 * DocumentsScreen — KYC document submission and status.
 * Sprint 37 — uses useAuth() instead of props.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { listMyDocuments, submitDocument, DocumentResponse } from "../api";

const DOC_TYPES = ["license", "insurance", "vehicle_registration", "id_card"];

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  approved: "#16A34A",
  rejected: "#EF4444",
};

export default function DocumentsScreen(): React.ReactElement {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!token) return;
    listMyDocuments(token)
      .then(setDocuments)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  const handleSubmit = async () => {
    if (!url.trim() || !token) return;
    setSubmitting(true);
    try {
      await submitDocument(token, docType, url.trim());
      setUrl("");
      load();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#1D4ED8" /></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Documents KYC</Text>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.document_id}
        renderItem={({ item }) => (
          <View style={styles.docRow}>
            <Text style={styles.docType}>{item.type}</Text>
            <Text style={[styles.docStatus, { color: STATUS_COLORS[item.status] ?? "#6B7280" }]}>
              {item.status}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Aucun document soumis.</Text>}
        style={{ maxHeight: 200 }}
      />
      <Text style={styles.subHeading}>Soumettre un document</Text>
      <View style={styles.typeRow}>
        {DOC_TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.typeChip, docType === t && styles.typeChipSelected]}
            onPress={() => setDocType(t)}
          >
            <Text style={[styles.typeText, docType === t && styles.typeTextSelected]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="URL du document (https://...)"
        autoCapitalize="none"
      />
      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Soumettre</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 12 },
  subHeading: { fontSize: 16, fontWeight: "600", marginTop: 20, marginBottom: 8 },
  docRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  docType: { fontSize: 14, color: "#374151" },
  docStatus: { fontWeight: "600", fontSize: 14 },
  empty: { color: "#9CA3AF", textAlign: "center", marginVertical: 12 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  typeChip: {
    borderWidth: 1,
    borderColor: "#1D4ED8",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  typeChipSelected: { backgroundColor: "#1D4ED8" },
  typeText: { color: "#1D4ED8", fontSize: 12 },
  typeTextSelected: { color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  button: {
    backgroundColor: "#1D4ED8",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "bold" },
});
