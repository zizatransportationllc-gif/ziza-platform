/**
 * DocumentsScreen — KYC document submission and status.
 * Sprint 53 — camera & gallery capture via expo-image-picker.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { listMyDocuments, submitDocument, DocumentResponse } from "../api";

const DOC_TYPES = ["license", "insurance", "registration", "id_card"];

const DOC_TYPE_LABELS: Record<string, string> = {
  license:      "🪪 Driver's License",
  insurance:    "🛡️ Vehicle Insurance",
  registration: "📋 Registration",
  id_card:      "🪪 Government ID",
};

const STATUS_COLORS: Record<string, string> = {
  pending:  "#F59E0B",
  approved: "#16A34A",
  rejected: "#EF4444",
};

export default function DocumentsScreen(): React.ReactElement {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!token) return;
    listMyDocuments(token)
      .then(setDocuments)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPreviewUri(result.assets[0].uri);
      setBase64Data(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Gallery permission is required to select a file.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPreviewUri(result.assets[0].uri);
      setBase64Data(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleSubmit = async () => {
    if (!base64Data || !token) return;
    setSubmitting(true);
    try {
      await submitDocument(token, docType, base64Data);
      setPreviewUri(null);
      setBase64Data(null);
      load();
      Alert.alert("Success", "Document submitted successfully.");
    } catch {
      Alert.alert("Error", "Failed to submit document. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>📄 My Documents</Text>

      {/* Document type selector */}
      <Text style={styles.sectionLabel}>Document type</Text>
      <View style={styles.typeRow}>
        {DOC_TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.typeChip, docType === t && styles.typeChipSelected]}
            onPress={() => setDocType(t)}
          >
            <Text style={[styles.typeText, docType === t && styles.typeTextSelected]}>
              {DOC_TYPE_LABELS[t] ?? t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Camera / Gallery buttons */}
      <View style={styles.captureRow}>
        <TouchableOpacity style={styles.captureBtn} onPress={pickFromCamera}>
          <Text style={styles.captureBtnText}>📷 Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.captureBtn, styles.galleryBtn]} onPress={pickFromGallery}>
          <Text style={[styles.captureBtnText, styles.galleryBtnText]}>🖼 Gallery</Text>
        </TouchableOpacity>
      </View>

      {/* Preview */}
      {previewUri && (
        <View style={styles.previewWrap}>
          <Image source={{ uri: previewUri }} style={styles.previewImg} resizeMode="cover" />
        </View>
      )}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, (!base64Data || submitting) && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!base64Data || submitting}
      >
        {submitting
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.submitBtnText}>⬆ Submit Document</Text>}
      </TouchableOpacity>

      {/* Submitted documents list */}
      <Text style={styles.subHeading}>Submitted documents</Text>
      {loading && <ActivityIndicator color="#F97316" style={{ marginTop: 12 }} />}
      {!loading && documents.length === 0 && (
        <Text style={styles.empty}>No documents submitted yet.</Text>
      )}
      {documents.map((item) => (
        <View key={item.document_id} style={styles.docRow}>
          <Text style={styles.docType}>{DOC_TYPE_LABELS[item.type] ?? item.type}</Text>
          <Text style={[styles.docStatus, { color: STATUS_COLORS[item.status] ?? "#6B7280" }]}>
            {item.status}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 20, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 16, color: "#F97316" },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#6B7280", marginBottom: 8 },
  subHeading: { fontSize: 16, fontWeight: "600", marginTop: 24, marginBottom: 10, color: "#374151" },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  typeChip: {
    borderWidth: 1,
    borderColor: "#F97316",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  typeChipSelected: { backgroundColor: "#F97316" },
  typeText: { color: "#F97316", fontSize: 12 },
  typeTextSelected: { color: "#fff" },
  captureRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  captureBtn: {
    flex: 1,
    backgroundColor: "#F97316",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  captureBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  galleryBtn: { backgroundColor: "#E5E7EB" },
  galleryBtnText: { color: "#374151" },
  previewWrap: { marginBottom: 14, alignItems: "center" },
  previewImg: { width: 200, height: 150, borderRadius: 8, borderWidth: 2, borderColor: "#F97316" },
  submitBtn: {
    backgroundColor: "#F97316",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  docRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  docType: { fontSize: 14, color: "#374151", flex: 1 },
  docStatus: { fontWeight: "600", fontSize: 14 },
  empty: { color: "#9CA3AF", textAlign: "center", marginVertical: 12 },
});
