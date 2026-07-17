/**
 * AccountScreen — secondary items grouped under one tab.
 * Sprint 65 — 4-tab navigation: rendered as the "Account" tab pane.
 *
 * A simple menu that pushes the existing detail screens (Profile, Payment
 * Methods, Documents) and links out to the standalone Ziza Driver app.
 */
import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// "Become a Driver" sends the user to the standalone Ziza Driver app's store
// page (see ProfileScreen for the same defaults).
const DRIVER_ANDROID_URL =
  process.env.EXPO_PUBLIC_DRIVER_ANDROID_URL ||
  "https://play.google.com/store/apps/details?id=com.zizatransportation.driver";
const DRIVER_IOS_URL =
  process.env.EXPO_PUBLIC_DRIVER_IOS_URL ||
  "https://apps.apple.com/search?term=ziza%20driver";

async function openDriverStore(): Promise<void> {
  const url = Platform.OS === "ios" ? DRIVER_IOS_URL : DRIVER_ANDROID_URL;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("Unable to open the store", "Please search for “Ziza Driver” in your app store.");
  }
}

interface Row {
  key: string;
  icon: string;
  label: string;
  onPress: (nav: NavProp) => void;
}

const ROWS: Row[] = [
  { key: "profile", icon: "👤", label: "Profile", onPress: (n) => n.navigate("Profile") },
  { key: "cards", icon: "💳", label: "Payment Methods", onPress: (n) => n.navigate("PaymentMethods") },
  { key: "places", icon: "📍", label: "Saved Places", onPress: (n) => n.navigate("SavedPlaces") },
  { key: "docs", icon: "📄", label: "My Documents", onPress: (n) => n.navigate("Documents") },
  { key: "driver", icon: "🧑‍✈️", label: "Become a Driver", onPress: () => openDriverStore() },
];

export default function AccountScreen(): React.ReactElement {
  const navigation = useNavigation<NavProp>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.menu}>
        {ROWS.map((row) => (
          <TouchableOpacity
            key={row.key}
            style={styles.row}
            onPress={() => row.onPress(navigation)}
          >
            <Text style={styles.rowIcon}>{row.icon}</Text>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowChevron}>{row.key === "driver" ? "↗" : "›"}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16 },
  menu: { gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowIcon: { fontSize: 20 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111827" },
  rowChevron: { fontSize: 18, color: "#9CA3AF" },
});
