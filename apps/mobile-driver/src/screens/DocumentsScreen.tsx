/**
 * DocumentsScreen — KYC document submission and status.
 * Sprint 59 — Document replace: upsert backend + replace button for all statuses.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { listMyDocuments, submitDocument, DocumentResponse } from "../api";

const DOC_TYPES = ["license", "insurance", "registration", "id_card"];

const DOC_TYPE_LABELS: Record<string, string> = {
  license:      "Driver's License",
  insurance:    "Vehicle Insurance",
  registration: "Vehicle Registration",
  id_card:      "Government ID",
};

const STATUS_LABELS: Record<string, string> = {
  pending:            "⏳ Pending",
  approved:           "✅ Approved",
  rejected:           "✗ Rejected",
  needs_resubmission: "🔄 Resubmit Required",
};

const STATUS_COLORS: Record<string, string> = {
  pending:            "#F59E0B",
  approved:           "#16A34A",
  rejected:           "#EF4444",
  needs_resubmission: "#F59E0B",
};

const ONBOARDING_STEPS = [
  "Account\nCreated",
  "Docs\nSubmitted",
  "Under\nReview",
  "Account\nApproved",
];

function OnboardingProgressBar({
  docs,
  entityStatus,
}: {
  docs: DocumentResponse[];
  entityStatus: string;
}) {
  const hasAnyDoc     = docs.length > 0;
  const hasActionItem = docs.some(
    (d) => d.status === "rejected" || d.status === "needs_resubmission",
  );
  let currentStep = 1;
  if (hasAnyDoc)                   currentStep = 2;
  if (hasAnyDoc && !hasActionItem) currentStep = 3;
  if (entityStatus === "active")   currentStep = 4;

  return (
    <View style={styles.stepperRow}>
      {ONBOARDING_STEPS.map((label, i) => {
        const n    = i + 1;
        const done = n < currentStep;
        const cur  = n === currentStep;
        return (
          <React.Fragment key={n}>
            <View style={styles.stepperStep}>
              <View style={[styles.stepCircle, done ? styles.circleDone : cur ? styles.circleActive : styles.circleTodo]}>
                <Text style={[styles.stepNum, done ? styles.numDone : cur ? styles.numActive : styles.numTodo]}>
                  {done ? "✓" : n}
                </Text>
              </View>
              <Text style={[styles.stepLabel, done || cur ? styles.labelActive : styles.labelTodo]}>
                {label}
              </Text>
            </View>
            {i < ONBOARDING_STEPS.length - 1 && (
              <View style={[styles.stepLine, done ? styles.lineDone : styles.lineTodo]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

export default function DocumentsScreen(): React.ReactElement {
  const { token, driverStatus } = useAuth();

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading]     = useState(true);
  const [docType, setDocType]     = useState(DOC_TYPES[0]);
  const [previewUri, setPreviewUri]   = useState<string | null>(null);
  const [base64Data, setBase64Data]   = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);

  const load = () => {
    if (!token) return;
    listMyDocuments(token)
      .then(setDocuments)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  const actionDocs = documents.filter(
    (d) => d.status === "rejected" || d.status === "needs_resubmission",
  );

  function handleResubmit(type: string) {
    setDocType(type);
    setPreviewUri(null);
    setBase64Data(null);
  }

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required.");
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
      Alert.alert("Permission needed", "Gallery permission is required.");
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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#1D4ED8" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>📄 KYC Documents</Text>

      {/* Onboarding progress stepper */}
      <OnboardingProgressBar docs={documents} entityStatus={driverStatus} />

      {/* Action needed banner */}
      {actionDocs.length > 0 && (
        <View style={styles.actionBanner}>
          <Text style={styles.actionBannerTitle}>⚠️ Action Required</Text>
          <Text style={styles.actionBannerBody}>
            {actionDocs.length} document{actionDocs.length > 1 ? "s" : ""} need{actionDocs.length === 1 ? "s" : ""} your attention — please re-upload below.
          </Text>
        </View>
      )}

      {/* All-clear banner */}
      {documents.length > 0 && actionDocs.length === 0 && driverStatus !== "active" && (
        <View style={styles.reviewBanner}>
          <Text style={styles.reviewBannerText}>
            ⏳ All documents submitted — your account is under admin review. You will be notified once approved.
          </Text>
        </View>
      )}

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

      {/* Submit button */}
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
      <FlatList
        data={documents}
        keyExtractor={(item) => item.document_id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={[styles.docRow, (item.status === "rejected" || item.status === "needs_resubmission") && styles.docRowAlert]}>
            <View style={styles.docRowTop}>
              <Text style={styles.docType}>{DOC_TYPE_LABELS[item.type] ?? item.type}</Text>
              <Text style={[styles.docStatus, { color: STATUS_COLORS[item.status] ?? "#6B7280" }]}>
                {STATUS_LABELS[item.status] ?? item.status}
              </Text>
            </View>
            {item.note_admin ? (
              <Text style={styles.docNote}>💬 {item.note_admin}</Text>
            ) : null}
            {(item.status === "rejected" || item.status === "needs_resubmission") ? (
              <TouchableOpacity
                style={styles.resubmitBtn}
                onPress={() => handleResubmit(item.type)}
              >
                <Text style={styles.resubmitBtnText}>🔄 Re-upload {DOC_TYPE_LABELS[item.type] ?? item.type}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.replaceBtn}
                onPress={() => handleResubmit(item.type)}
              >
                <Text style={styles.replaceBtnText}>↩ Replace</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No documents submitted yet.</Text>}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 16, color: "#1D4ED8" },

  // Onboarding stepper
  stepperRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  stepperStep: { flex: 1, alignItems: "center" },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  circleDone:   { backgroundColor: "#22C55E" },
  circleActive: { backgroundColor: "#1D4ED8" },
  circleTodo:   { backgroundColor: "transparent", borderWidth: 2, borderColor: "#D1D5DB" },
  stepNum: { fontSize: 12, fontWeight: "700" },
  numDone:   { color: "#fff" },
  numActive: { color: "#fff" },
  numTodo:   { color: "#9CA3AF" },
  stepLabel: { fontSize: 9, textAlign: "center", marginTop: 3, lineHeight: 12 },
  labelActive: { color: "#1F2937", fontWeight: "600" },
  labelTodo:   { color: "#9CA3AF" },
  stepLine: { flex: 0.8, height: 2, marginBottom: 16 },
  lineDone: { backgroundColor: "#22C55E" },
  lineTodo: { backgroundColor: "#E5E7EB" },

  // Banners
  actionBanner: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#F59E0B", borderRadius: 8, padding: 12, marginBottom: 12 },
  actionBannerTitle: { color: "#92400E", fontWeight: "700", fontSize: 14, marginBottom: 4 },
  actionBannerBody: { color: "#78350F", fontSize: 13 },
  reviewBanner: { backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#93C5FD", borderRadius: 8, padding: 12, marginBottom: 12 },
  reviewBannerText: { color: "#1E40AF", fontSize: 13 },

  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  typeChip: { borderWidth: 1, borderColor: "#1D4ED8", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  typeChipSelected: { backgroundColor: "#1D4ED8" },
  typeText: { color: "#1D4ED8", fontSize: 12 },
  typeTextSelected: { color: "#fff" },
  captureRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  captureBtn: { flex: 1, backgroundColor: "#1D4ED8", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  captureBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  galleryBtn: { backgroundColor: "#E5E7EB" },
  galleryBtnText: { color: "#374151" },
  previewWrap: { marginBottom: 12, alignItems: "center" },
  previewImg: { width: 180, height: 130, borderRadius: 8, borderWidth: 2, borderColor: "#1D4ED8" },
  submitBtn: { backgroundColor: "#1D4ED8", borderRadius: 8, padding: 14, alignItems: "center", marginBottom: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  subHeading: { fontSize: 16, fontWeight: "600", marginTop: 20, marginBottom: 8, color: "#374151" },
  docRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  docRowAlert: { borderLeftWidth: 3, borderLeftColor: "#F59E0B", paddingLeft: 8 },
  docRowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  docType: { fontSize: 14, color: "#374151", flex: 1 },
  docStatus: { fontWeight: "600", fontSize: 13 },
  docNote: { fontSize: 12, color: "#6B7280", fontStyle: "italic", marginTop: 4 },
  resubmitBtn: { marginTop: 8, backgroundColor: "#FEF9C3", borderWidth: 1, borderColor: "#EAB308", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, alignSelf: "flex-start" },
  resubmitBtnText: { color: "#713F12", fontWeight: "700", fontSize: 12 },
  replaceBtn: { marginTop: 6, backgroundColor: "transparent", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, alignSelf: "flex-start" },
  replaceBtnText: { color: "#9CA3AF", fontWeight: "600", fontSize: 11 },
  empty: { color: "#9CA3AF", textAlign: "center", marginVertical: 12 },
});
