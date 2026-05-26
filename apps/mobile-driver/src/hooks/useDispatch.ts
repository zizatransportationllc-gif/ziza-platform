/**
 * useDispatch — polls available trips AND assistance every 10 s.
 * Sprint 28 — Application mobile driver
 */
import { useState, useEffect, useRef } from "react";
import {
  listAvailableTrips,
  listAvailableAssistance,
  TripResponse,
  AssistanceResponse,
} from "../api";

const POLL_INTERVAL_MS = 10_000;

interface UseDispatchResult {
  trips: TripResponse[];
  assistance: AssistanceResponse[];
  loading: boolean;
  error: string | null;
}

export function useDispatch(token: string | null): UseDispatchResult {
  const [trips, setTrips] = useState<TripResponse[]>([]);
  const [assistance, setAssistance] = useState<AssistanceResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = async () => {
    if (!token) return;
    try {
      const [t, a] = await Promise.all([
        listAvailableTrips(token),
        listAvailableAssistance(token),
      ]);
      setTrips(t);
      setAssistance(a);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Erreur dispatch");
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

  return { trips, assistance, loading, error };
}
