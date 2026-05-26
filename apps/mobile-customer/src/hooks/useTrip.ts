/**
 * useTrip — polls trip status every 5 s, stops on terminal state.
 * Sprint 27 — Application mobile customer
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { getTripStatus, TripResponse } from "../api";

const TERMINAL_STATUSES = ["completed", "cancelled"];
const POLL_INTERVAL_MS = 5_000;

interface UseTripResult {
  trip: TripResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTrip(
  token: string | null,
  tripId: string | null
): UseTripResult {
  const [trip, setTrip] = useState<TripResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!token || !tripId) return;
    try {
      const data = await getTripStatus(token, tripId);
      setTrip(data);
      setError(null);
      if (TERMINAL_STATUSES.includes(data.status)) {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    }
  }, [token, tripId]);

  useEffect(() => {
    if (!token || !tripId) return;
    setLoading(true);
    poll().finally(() => setLoading(false));
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [token, tripId, poll]);

  return { trip, loading, error, refresh: poll };
}
