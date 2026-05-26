/**
 * PaymentScreen — WebView wrapping the Ziza payment checkout page.
 * Sprint 27 — Application mobile customer
 */
import React, { useRef } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { useRoute, RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/AppNavigator";

type PaymentRouteProp = RouteProp<RootStackParamList, "Payment">;

export default function PaymentScreen(): React.ReactElement {
  const route = useRoute<PaymentRouteProp>();
  const { checkoutUrl } = route.params;
  const webViewRef = useRef<WebView>(null);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: checkoutUrl }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#F97316" />
          </View>
        )}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
});
