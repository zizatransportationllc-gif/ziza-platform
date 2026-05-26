/**
 * useTracking — polls driver GPS position every 5 s.
 * Active when trip status is "accepted" or "in_progress".
 * Stops automatically on terminal statuses.
 * Sprint 27 — Application mobile customer
 */
import { useState, useEffect, useRef } from "react";
import { getDriverPosition, DriverPosition } from "../api";

const ACTIVE_STATUSES = ["accepted", "in_progress"];
const POLL_INTERVAL_MS = 5_000;

interface UseTrackingResult {
  position: DriverPosition | null;
  error: string | null;
}

export function useTracking(
  token: string | null,
  driverId: string | null,
  tripStatus: string | null
): UseTrackingResult {
  const [position, setPosition] = useState<DriverPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const active = tripStatus && ACTIVE_STATUSES.includes(tripStatus);
    if (!token || !driverId || !active) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const poll = async () => {
      try {
        const pos = await getDriverPosition(token, driverId);
        setPosition(pos);
        setError(null);
      } catch (e: any) {
        setError(e.message ?? "Unknown error");
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [token, driverId, tripStatus]);

  return { position, error };
}
