/**
 * useDispatch — polls available trips every 10 s.
 * Sprint 48 — removed Assistance dispatch.
 */
import { useState, useEffect, useRef } from "react";
import {
  listAvailableTrips,
  TripResponse,
} from "../api";

const POLL_INTERVAL_MS = 10_000;

interface UseDispatchResult {
  trips: TripResponse[];
  loading: boolean;
  error: string | null;
}

export function useDispatch(token: string | null): UseDispatchResult {
  const [trips, setTrips] = useState<TripResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = async () => {
    if (!token) return;
    try {
      const t = await listAvailableTrips(token);
      setTrips(t);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Dispatch error");
    }
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    poll().finally(() => setLoading(false));
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [token]);

  return { trips, loading, error };
}
