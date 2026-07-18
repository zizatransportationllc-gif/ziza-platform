/**
 * useNotifications — Expo notification listeners + Android channel for
 * mobile-craft (professional). Creates a high-importance "default" channel so
 * incoming notifications play a sound and vibrate.
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export function useNotifications(_token: string | null): void {
  const receivedRef = useRef<Notifications.Subscription | null>(null);
  const responseRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Android 8+ requires an explicit channel for sound + vibration.
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "Ziza Craft",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1D4ED8",
        sound: "default",
      }).catch(() => {});
    }

    receivedRef.current = Notifications.addNotificationReceivedListener(() => {
      // Display + sound/vibration handled by setNotificationHandler + channel.
    });
    responseRef.current = Notifications.addNotificationResponseReceivedListener(() => {
      // Future: navigate based on response data.
    });

    return () => {
      receivedRef.current?.remove();
      responseRef.current?.remove();
    };
  }, []);
}
