/**
 * DocumentsScreen — KYC document submission and status.
 * Sprint 61 — Accept image (camera/gallery) OR PDF; backend converts images to PDF.
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
import * as DocumentPicker from "expo-document-picker";
// SDK 54 — the classic readAsStringAsync/EncodingType API now lives in /legacy
import * as FileSystem from "expo-file-system/legacy";
import { useAuth } from "../context/AuthContext";
import { listMyDocuments, submitDocument, DocumentResponse } from "../api";

const DOC_TYPES = ["license", "insurance", "registration", "id_card"];

const DOC_TYPE_LABELS: Record<string, string> = {
  license:      "🪪 Driver's License",
  insurance:    "🛡️ Vehicle Insurance",
  registration: "📋 Registration",
  id_card:      "🪪 Government ID",
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
  const { token, profile } = useAuth();
  const profStatus: string = profile?.status ?? "pending_docs";

  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [loading, setLoading]     = useState(true);
  const [docType, setDocType]     = useState(DOC_TYPES[0]);

  // Captured file — either a base64 image data URL or a PDF data URL
  const [fileData, setFileData]   = useState<string | null>(null);
  const [fileUri, setFileUri]     = useState<string | null>(null);   // image preview URI
  const [fileName, setFileName]   = useState<string | null>(null);   // PDF filename
  const [submitting, setSubmitting] = useState(false);

  const isPdf = fileData?.startsWith("data:application/pdf") ?? false;

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
    setFileData(null);
    setFileUri(null);
    setFileName(null);
  }

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setFileUri(result.assets[0].uri);
      setFileData(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setFileName(null);
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
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setFileUri(result.assets[0].uri);
      setFileData(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setFileName(null);
    }
  };

  const pickPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setFileData(`data:application/pdf;base64,${base64}`);
      setFileUri(null);
      setFileName(asset.name);
    } catch {
      Alert.alert("Error", "Could not read the selected file.");
    }
  };

  const handleSubmit = async () => {
    if (!fileData || !token) return;
    setSubmitting(true);
    try {
      await submitDocument(token, docType, fileData);
      setFileData(null);
      setFileUri(null);
      setFileName(null);
      load();
      Alert.alert("Success", "Document submitted successfully.");
    } catch {
      Alert.alert("Error", "Failed to submit document. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#059669" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>📄 My Documents</Text>

      {/* Onboarding progress stepper */}
      <OnboardingProgressBar docs={documents} entityStatus={profStatus} />

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
      {documents.length > 0 && actionDocs.length === 0 && profStatus !== "active" && (
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

      {/* Capture buttons */}
      <View style={styles.captureRow}>
        <TouchableOpacity style={styles.captureBtn} onPress={pickFromCamera}>
          <Text style={styles.captureBtnText}>📷 Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.captureBtn, styles.galleryBtn]} onPress={pickFromGallery}>
          <Text style={[styles.captureBtnText, styles.galleryBtnText]}>🖼 Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.captureBtn, styles.pdfBtn]} onPress={pickPDF}>
          <Text style={[styles.captureBtnText, styles.pdfBtnText]}>📎 PDF</Text>
        </TouchableOpacity>
      </View>

      {/* Preview — image or PDF filename */}
      {fileData && (
        isPdf ? (
          <View style={styles.pdfSelectedWrap}>
            <Text style={styles.pdfIcon}>📄</Text>
            <Text style={styles.pdfFileName} numberOfLines={1}>{fileName}</Text>
          </View>
        ) : (
          fileUri && (
            <View style={styles.previewWrap}>
              <Image source={{ uri: fileUri }} style={styles.previewImg} resizeMode="cover" />
            </View>
          )
        )
      )}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, (!fileData || submitting) && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!fileData || submitting}
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
  container: { flex: 1, backgroundColor: "#0f1a14" },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 22, fontWeight: "bold", marginBottom: 16, color: "#34d399" },

  // Onboarding stepper
  stepperRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  stepperStep: { flex: 1, alignItems: "center" },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  circleDone:   { backgroundColor: "#059669" },
  circleActive: { backgroundColor: "#34d399" },
  circleTodo:   { backgroundColor: "transparent", borderWidth: 2, borderColor: "#233328" },
  stepNum: { fontSize: 12, fontWeight: "700" },
  numDone:   { color: "#fff" },
  numActive: { color: "#0f1a14" },
  numTodo:   { color: "#6b9e7a" },
  stepLabel: { fontSize: 9, textAlign: "center", marginTop: 3, lineHeight: 12 },
  labelActive: { color: "#e8f5ec", fontWeight: "600" },
  labelTodo:   { color: "#6b9e7a" },
  stepLine: { flex: 0.8, height: 2, marginBottom: 16 },
  lineDone: { backgroundColor: "#059669" },
  lineTodo: { backgroundColor: "#233328" },

  // Banners
  actionBanner: { backgroundColor: "rgba(245,158,11,0.12)", borderWidth: 1, borderColor: "#f59e0b", borderRadius: 8, padding: 12, marginBottom: 12 },
  actionBannerTitle: { color: "#fbbf24", fontWeight: "700", fontSize: 14, marginBottom: 4 },
  actionBannerBody: { color: "#fcd34d", fontSize: 13 },
  reviewBanner: { backgroundColor: "rgba(52,211,153,0.08)", borderWidth: 1, borderColor: "rgba(52,211,153,0.3)", borderRadius: 8, padding: 12, marginBottom: 12 },
  reviewBannerText: { color: "#34d399", fontSize: 13 },

  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#6b9e7a", marginBottom: 8 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  typeChip: { borderWidth: 1, borderColor: "#34d399", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  typeChipSelected: { backgroundColor: "#059669" },
  typeText: { color: "#34d399", fontSize: 12 },
  typeTextSelected: { color: "#fff" },

  captureRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  captureBtn: { flex: 1, backgroundColor: "#059669", borderRadius: 8, paddingVertical: 11, alignItems: "center" },
  captureBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  galleryBtn: { backgroundColor: "#162117", borderWidth: 1, borderColor: "#34d399" },
  galleryBtnText: { color: "#34d399" },
  pdfBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#6b9e7a" },
  pdfBtnText: { color: "#6b9e7a" },

  previewWrap: { marginBottom: 14, alignItems: "center" },
  previewImg: { width: 200, height: 150, borderRadius: 8, borderWidth: 2, borderColor: "#34d399" },
  pdfSelectedWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#162117", borderWidth: 1, borderColor: "#34d399", borderRadius: 8, padding: 10, marginBottom: 12 },
  pdfIcon: { fontSize: 20 },
  pdfFileName: { flex: 1, fontSize: 13, color: "#34d399", fontWeight: "600" },

  submitBtn: { backgroundColor: "#059669", borderRadius: 8, padding: 14, alignItems: "center", marginBottom: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  subHeading: { fontSize: 16, fontWeight: "600", marginTop: 24, marginBottom: 10, color: "#e8f5ec" },
  docRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#233328" },
  docRowAlert: { borderLeftWidth: 3, borderLeftColor: "#f59e0b", paddingLeft: 8 },
  docRowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  docType: { fontSize: 14, color: "#e8f5ec", flex: 1 },
  docStatus: { fontWeight: "600", fontSize: 13 },
  docNote: { fontSize: 12, color: "#6b9e7a", fontStyle: "italic", marginTop: 4 },
  resubmitBtn: { marginTop: 8, backgroundColor: "rgba(245,158,11,0.15)", borderWidth: 1, borderColor: "#f59e0b", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, alignSelf: "flex-start" },
  resubmitBtnText: { color: "#fbbf24", fontWeight: "700", fontSize: 12 },
  replaceBtn: { marginTop: 6, backgroundColor: "transparent", borderWidth: 1, borderColor: "#233328", borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, alignSelf: "flex-start" },
  replaceBtnText: { color: "#6b9e7a", fontWeight: "600", fontSize: 11 },
  empty: { color: "#6b9e7a", textAlign: "center", marginVertical: 12 },
});
