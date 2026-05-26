/**
 * LocationTask — background task that pushes driver GPS to the API.
 * Runs even when the app is in the background or terminated (foreground service on Android).
 * Sprint 28 — Application mobile driver
 */
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { updateDriverLocation } from "../api";

export const LOCATION_TASK_NAME = "ziza-background-location";

/**
 * IMPORTANT: TaskManager.defineTask must be called at module-level
 * (top of the file, before any component mounts) so Expo registers
 * the task during app initialisation.
 */
TaskManager.defineTask(
  LOCATION_TASK_NAME,
  async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
    if (error) {
      console.error("[LocationTask] error:", error.message);
      return;
    }

    const locations = data?.locations;
    if (!locations?.length) return;

    const { latitude, longitude } = locations[0].coords;

    try {
      const token = await AsyncStorage.getItem("ziza_access_token");
      if (token) {
        await updateDriverLocation(token, latitude, longitude);
      }
    } catch {
      // Silently ignore — background task must never crash
    }
  }
);
