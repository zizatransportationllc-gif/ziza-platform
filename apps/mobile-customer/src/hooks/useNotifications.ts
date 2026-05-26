/**
 * useNotifications — requests push permission and registers FCM device token.
 * Sprint 27 — Application mobile customer
 */
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { registerDeviceToken } from "../api";

export function useNotifications(token: string | null): void {
  useEffect(() => {
    if (!token) return;

    const register = async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") return;
        const pushToken = await Notifications.getExpoPushTokenAsync();
        if (pushToken?.data) {
          await registerDeviceToken(token, pushToken.data, "android");
        }
      } catch {
        // Silently ignore — push registration is best-effort
      }
    };

    register();
  }, [token]);
}
