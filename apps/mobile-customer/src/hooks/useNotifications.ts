/**
 * useNotifications — sets up Expo notification listeners for mobile-customer.
 * Sprint 39 — foreground display + tap handling + Android channel creation.
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export function useNotifications(_token: string | null): void {
  const receivedRef = useRef<Notifications.Subscription | null>(null);
  const responseRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Android 8+ requires an explicit notification channel
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "Ziza",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1D4ED8",
        sound: "default",
      }).catch(() => {});
    }

    // Notification received while app is in foreground
    receivedRef.current = Notifications.addNotificationReceivedListener(
      (_notification) => {
        // setNotificationHandler (App.tsx) already shows the alert.
        // Future: update badge / refresh trip status here.
      }
    );

    // User taps a notification (foreground, background, or killed)
    responseRef.current = Notifications.addNotificationResponseReceivedListener(
      (_response) => {
        // Future Phase 2: navigate based on _response.notification.request.content.data
      }
    );

    return () => {
      receivedRef.current?.remove();
      responseRef.current?.remove();
    };
  }, []);
}
