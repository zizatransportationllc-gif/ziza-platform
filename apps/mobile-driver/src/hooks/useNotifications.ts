/**
 * useNotifications — sets up Expo notification listeners for mobile-driver.
 * Sprint 39 — foreground display + tap handling + Android channel creation.
 *
 * Critical for drivers: push notifications are the primary mechanism to alert
 * them of new trip requests without relying solely on polling.
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
        name: "Ziza Driver",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1D4ED8",
        sound: "default",
      }).catch(() => {});
    }

    // Notification received while app is in foreground
    receivedRef.current = Notifications.addNotificationReceivedListener(
      (_notification) => {
        // setNotificationHandler (App.tsx) handles display.
        // Future: trigger immediate dispatch poll to refresh trip list.
      }
    );

    // User taps the notification
    responseRef.current = Notifications.addNotificationResponseReceivedListener(
      (_response) => {
        // Future Phase 2: navigate to Dispatch or ActiveTrip based on data.
      }
    );

    return () => {
      receivedRef.current?.remove();
      responseRef.current?.remove();
    };
  }, []);
}
