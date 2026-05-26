/**
 * useBackgroundLocation — starts/stops expo-location background tracking.
 * Runs as a foreground service on Android, background mode on iOS.
 * Sprint 28 — Application mobile driver
 */
import { useEffect } from "react";
import * as Location from "expo-location";
import { LOCATION_TASK_NAME } from "../background/LocationTask";

const LOCATION_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 5_000,      // every 5 s
  distanceInterval: 20,     // or every 20 m
  foregroundService: {
    notificationTitle: "Ziza — position active",
    notificationBody: "Votre position est partagée avec les clients",
    notificationColor: "#1D4ED8",
  },
};

export function useBackgroundLocation(
  token: string | null,
  isOnline: boolean
): void {
  useEffect(() => {
    if (!token || !isOnline) {
      Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
      return;
    }

    const start = async () => {
      try {
        const { status } =
          await Location.requestBackgroundPermissionsAsync();
        if (status !== "granted") return;

        const running = await Location.hasStartedLocationUpdatesAsync(
          LOCATION_TASK_NAME
        );
        if (!running) {
          await Location.startLocationUpdatesAsync(
            LOCATION_TASK_NAME,
            LOCATION_OPTIONS
          );
        }
      } catch {
        // Permission denied or device limitation — fail silently
      }
    };

    start();

    return () => {
      Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
    };
  }, [token, isOnline]);
}
